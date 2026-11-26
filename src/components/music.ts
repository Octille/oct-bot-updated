import {
  ActionRowBuilder,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type ModalActionRowComponentBuilder,
} from 'discord.js';
import type { Player } from 'lavalink-client';
import { defineComponent } from '../framework/types';
import { musicRules } from '../content/music';
import { BRAND } from '../content/icons';
import { embed } from '../lib/embeds';
import { UserError } from '../lib/errors';
import { icon, titleIcon } from '../lib/icons';
import { back, cycleLoop, parsePosition, setVolume, shuffle, skip, stop, togglePause } from '../music/actions';
import { isCurrentPanel, lavalink, notePanelEdited, refreshPanel, voiceCheck } from '../music/manager';
import { controlsView, formatTime, nowPlayingPanel, panelState, queuePage } from '../music/panel';
import { ANYONE, makeId } from '../lib/customId';
import { logError } from '../lib/logger';
import { btn, NAV, row } from '../ui/kit';

/** Takes the buttons off a V2 panel nobody can use any more (e.g. after a restart), keeping the rest. */
async function stripPanelButtons(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    await interaction.update({ components: [] });
    return;
  }
  const components = interaction.message.components.map((c) => {
    const json = c.toJSON();
    if (json.type === ComponentType.Container) json.components = json.components.filter((x) => x.type !== ComponentType.ActionRow);
    return json;
  });
  await interaction.update({ components, flags: MessageFlags.IsComponentsV2 });
}

/** The private controls after the music ended from them. */
function closedControls(note: string) {
  return { components: [new ContainerBuilder().setAccentColor(BRAND).addTextDisplayComponents(new TextDisplayBuilder().setContent(`${icon('success')} ${note}`))], flags: MessageFlags.IsComponentsV2 } as const;
}

async function queueView(interaction: ButtonInteraction, player: Player, page: number, update: boolean): Promise<void> {
  const q = queuePage(player, page, musicRules.queuePerPage);
  const view = {
    embeds: [embed('music').setTitle(`${titleIcon('music')} Queue`).setDescription(q.text)],
    components: q.pages > 1 ? [row(
      btn(makeId('mp', ANYONE, 'qp', Math.max(0, page - 1)), 'Prev', NAV, { disabled: page <= 0 }),
      btn(makeId('mp', ANYONE, 'qp', page + 1), 'Next', NAV, { disabled: page >= q.pages - 1 }),
    )] : [],
  };
  if (update) await interaction.update(view);
  else await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}

/**
 * Now-playing panel buttons `mp:*:<action>`, the private controls `mp:*:c:<action>` and the seek
 * modal `mp:*:seek`. Anyone in the bot's voice channel can use them.
 */
export const musicPanelHandler = defineComponent({
  prefix: 'mp',
  async execute({ interaction, id, client }) {
    const player = lavalink()?.getPlayer(interaction.guildId ?? '');
    const [action, sub] = id.args;

    if (interaction.isModalSubmit()) {
      if (action !== 'seek') return;
      if (!player?.queue.current) throw new UserError('Nothing is playing.');
      const problem = voiceCheck(interaction.member as GuildMember, player);
      if (problem) throw new UserError(problem);
      const t = player.queue.current;
      const ms = parsePosition(interaction.fields.getTextInputValue('to'));
      if (ms === null || ms > t.info.duration) throw new UserError(`Pick a time between 0:00 and ${formatTime(t.info.duration)}.`);
      await player.seek(ms);
      void refreshPanel(client, player).catch(() => undefined);
      await interaction.reply({ content: `${icon('success')} Jumped to ${formatTime(ms)}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!interaction.isButton()) return;

    const controls = action === 'c';
    if (!player?.queue.current) {
      if (controls) throw new UserError('Nothing is playing any more.');
      await stripPanelButtons(interaction);
      return;
    }
    const act = controls ? sub : action;
    if (act === 'queue' || act === 'qp') return queueView(interaction, player, Number(id.args[controls ? 2 : 1] ?? 0) || 0, act === 'qp');
    if (!controls && !isCurrentPanel(player.guildId, interaction.message.id)) {
      // An older panel from earlier in this session: only the newest one has working buttons
      await stripPanelButtons(interaction);
      return;
    }
    const problem = voiceCheck(interaction.member as GuildMember, player);
    if (problem) throw new UserError(problem);

    if (act === 'controls') {
      await interaction.reply({ ...controlsView(panelState(player), player.queue.current), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      return;
    }
    if (act === 'seek') {
      const t = player.queue.current;
      if (!t.info.isSeekable || t.info.isStream) throw new UserError("You can't seek in this track (it's a live stream).");
      await interaction.showModal(new ModalBuilder().setCustomId(makeId('mp', ANYONE, 'seek')).setTitle('Jump to a time').addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(new TextInputBuilder().setCustomId('to')
          .setLabel(`Time (0:00 to ${formatTime(t.info.duration)})`).setPlaceholder('1:30').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)),
      ));
      return;
    }

    let note: string;
    switch (act) {
      case 'pause': note = await togglePause(player); break;
      case 'skip': note = await skip(player); break;
      case 'back': note = await back(player); break;
      case 'loop': note = await cycleLoop(player); break;
      case 'shuffle': note = await shuffle(player); break;
      case 'voldown': note = await setVolume(player, player.volume - 10); break;
      case 'volup': note = await setVolume(player, player.volume + 10); break;
      case 'stop':
        if (controls) {
          await interaction.update(closedControls(await stop(player)));
          return;
        }
        await interaction.deferUpdate();
        // A failure here must not turn the shared panel into an error message
        await stop(player).catch(async (err) => {
          logError('music stop', err);
          await interaction.followUp({ content: "Couldn't stop the music. Try `/music stop`.", flags: MessageFlags.Ephemeral }).catch(() => undefined);
        });
        return;
      default: return;
    }

    if (controls) {
      // The private view updates; the public panel follows
      await interaction.update(player.queue.current ? controlsView(panelState(player), player.queue.current) : closedControls(note));
      void refreshPanel(client, player).catch(() => undefined);
      return;
    }
    // Skip and Back post a new panel for the next track; everything else updates this one
    if (act === 'skip' || (act === 'back' && !note.startsWith('Restarted'))) {
      await interaction.reply({ content: `${icon('success')} ${interaction.user} ${note.charAt(0).toLowerCase()}${note.slice(1)}`, allowedMentions: { parse: [] } });
      return;
    }
    if (player.queue.current) {
      await interaction.update(nowPlayingPanel(panelState(player), player.queue.current));
      notePanelEdited(player);
    } else {
      await interaction.reply({ content: note, flags: MessageFlags.Ephemeral });
    }
  },
});

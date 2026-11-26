import { MessageFlags, type GuildMember } from 'discord.js';
import { defineComponent } from '../framework/types';
import { musicRules } from '../content/music';
import { embed } from '../lib/embeds';
import { UserError } from '../lib/errors';
import { icon, titleIcon } from '../lib/icons';
import { cycleLoop, setVolume, shuffle, skip, stop, togglePause } from '../music/actions';
import { lavalink, voiceCheck } from '../music/manager';
import { nowPlayingPanel, queuePage } from '../music/panel';
import { ANYONE, makeId } from '../lib/customId';
import { logError } from '../lib/logger';
import { btn, NAV, row } from '../ui/kit';

/** Now-playing panel buttons: `mp:*:<action>`. Anyone in the bot's voice channel can use them. */
export const musicPanelHandler = defineComponent({
  prefix: 'mp',
  async execute({ interaction, id }) {
    if (!interaction.isButton()) return;
    const player = lavalink()?.getPlayer(interaction.guildId ?? '');
    if (!player?.queue.current) {
      await interaction.update({ components: [] });
      return;
    }
    const action = id.args[0];
    if (action === 'queue' || action === 'qp') {
      // Private queue view with paging: `mp:*:qp:<page>`
      const page = Number(id.args[1] ?? 0) || 0;
      const q = queuePage(player, page, musicRules.queuePerPage);
      const view = {
        embeds: [embed('music').setTitle(`${titleIcon('music')} Queue`).setDescription(q.text)],
        components: q.pages > 1 ? [row(
          btn(makeId('mp', ANYONE, 'qp', Math.max(0, page - 1)), 'Prev', NAV, { disabled: page <= 0 }),
          btn(makeId('mp', ANYONE, 'qp', page + 1), 'Next', NAV, { disabled: page >= q.pages - 1 }),
        )] : [],
      };
      if (action === 'qp') await interaction.update(view);
      else await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
      return;
    }
    const problem = voiceCheck(interaction.member as GuildMember, player);
    if (problem) throw new UserError(problem);
    let note: string;
    switch (action) {
      case 'pause': note = await togglePause(player); break;
      case 'skip': note = await skip(player); break;
      case 'loop': note = await cycleLoop(player); break;
      case 'shuffle': note = await shuffle(player); break;
      case 'voldown': note = await setVolume(player, player.volume - 10); break;
      case 'volup': note = await setVolume(player, player.volume + 10); break;
      case 'stop':
        await interaction.deferUpdate();
        // A failure here must not turn the shared panel into an error message
        await stop(player).catch(async (err) => {
          logError('music stop', err);
          await interaction.followUp({ content: "Couldn't stop the music. Try `/music stop`.", flags: MessageFlags.Ephemeral }).catch(() => undefined);
        });
        return;
      default: return;
    }
    // Skipping posts a new panel for the next track; everything else updates this one
    if (action === 'skip') {
      await interaction.reply({ content: `${icon('success')} ${interaction.user} ${note.charAt(0).toLowerCase()}${note.slice(1)}`, allowedMentions: { parse: [] } });
      return;
    }
    if (player.queue.current) await interaction.update(nowPlayingPanel(player, player.queue.current));
    else await interaction.reply({ content: note, flags: MessageFlags.Ephemeral });
  },
});

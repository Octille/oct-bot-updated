import { ButtonStyle, MessageFlags, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { musicRules } from '../../content/music';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button, rows } from '../../lib/ui';
import { cycleLoop, parsePosition, setVolume, shuffle, skip, stop, togglePause } from '../../music/actions';
import { lavalink, nodeReady, refreshPanel, voiceCheck } from '../../music/manager';
import { escapeTitle, formatTime, queuePage } from '../../music/panel';

export default defineCommand({
  data: new SlashCommandBuilder().setName('music').setDescription('Control the music')
    .addSubcommand((s) => s.setName('queue').setDescription('Show the queue'))
    .addSubcommand((s) => s.setName('nowplaying').setDescription("What's playing"))
    .addSubcommand((s) => s.setName('skip').setDescription('Skip the current track'))
    .addSubcommand((s) => s.setName('pause').setDescription('Pause or resume'))
    .addSubcommand((s) => s.setName('stop').setDescription('Stop, clear the queue and leave'))
    .addSubcommand((s) => s.setName('loop').setDescription('Loop the track or the queue')
      .addStringOption((o) => o.setName('mode').setDescription('What to loop').setRequired(true).addChoices({ name: 'Off', value: 'off' }, { name: 'Track', value: 'track' }, { name: 'Queue', value: 'queue' })))
    .addSubcommand((s) => s.setName('volume').setDescription('Set the volume')
      .addIntegerOption((o) => o.setName('percent').setDescription(`0–${musicRules.maxVolume}`).setRequired(true).setMinValue(0).setMaxValue(musicRules.maxVolume)))
    .addSubcommand((s) => s.setName('seek').setDescription('Jump to a time in the track')
      .addStringOption((o) => o.setName('to').setDescription('e.g. 1:30').setRequired(true).setMaxLength(10)))
    .addSubcommand((s) => s.setName('shuffle').setDescription('Shuffle the queue'))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a track from the queue')
      .addIntegerOption((o) => o.setName('position').setDescription('Its number in the queue').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('jump').setDescription('Skip ahead to a track in the queue')
      .addIntegerOption((o) => o.setName('position').setDescription('Its number in the queue').setRequired(true).setMinValue(1))),
  category: 'music',
  guildOnly: true,
  async execute({ interaction, client }) {
    const sub = interaction.options.getSubcommand();
    if (!nodeReady()) throw new UserError('Music is unavailable right now. Try again in a minute.');
    const player = lavalink()?.getPlayer(interaction.guildId!);
    if (!player?.queue.current && sub !== 'queue') throw new UserError('Nothing is playing. Start with `/play`.');
    const reply = (text: string, ephemeral = false) => interaction.reply({ embeds: [embed('music').setTitle(`${titleIcon('music')} Music`).setDescription(text)], ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });

    if (sub === 'queue') {
      if (!player) throw new UserError('Nothing is playing. Start with `/play`.');
      let page = 0;
      const view = () => {
        const q = queuePage(player, page, musicRules.queuePerPage);
        return {
          embeds: [embed('music').setTitle(`${titleIcon('music')} Queue`).setDescription(q.text)],
          components: q.pages > 1 ? rows([
            button('~mq', interaction.user.id, ['prev'], 'Prev', ButtonStyle.Secondary, undefined, page === 0),
            button('~mq', interaction.user.id, ['next'], 'Next', ButtonStyle.Secondary, undefined, page >= q.pages - 1),
          ]) : [],
        };
      };
      await interaction.reply(view());
      const message = await interaction.fetchReply();
      const collector = collect(message, { time: 5 * 60_000, idle: 2 * 60_000 });
      collector.on('collect', (i) => {
        page += i.customId.endsWith('next') ? 1 : -1;
        i.update(view()).catch((err) => logError('queue', err));
      });
      return;
    }
    if (sub === 'nowplaying') {
      const t = player!.queue.current!;
      return reply(`**[${escapeTitle(t.info.title)}](${t.info.uri})**\n${t.info.author} · ${formatTime(player!.position)} / ${formatTime(t.info.duration)} · volume ${player!.volume}%`);
    }

    const problem = voiceCheck(interaction.member as GuildMember, player);
    if (problem) throw new UserError(problem);
    const p = player!;
    let text: string;
    switch (sub) {
      case 'skip': text = await skip(p); break;
      case 'pause': text = await togglePause(p); break;
      case 'stop': text = await stop(p); break;
      case 'loop': text = await cycleLoop(p, interaction.options.getString('mode', true) as 'off' | 'track' | 'queue'); break;
      case 'volume': text = await setVolume(p, interaction.options.getInteger('percent', true)); break;
      case 'shuffle': text = await shuffle(p); break;
      case 'seek': {
        if (!p.queue.current!.info.isSeekable || p.queue.current!.info.isStream) throw new UserError("You can't seek in this track (it's a live stream).");
        const ms = parsePosition(interaction.options.getString('to', true));
        const dur = p.queue.current!.info.duration;
        if (ms === null || ms > dur) throw new UserError(`Pick a time between 0:00 and ${formatTime(dur)}.`);
        await p.seek(ms);
        text = `Jumped to ${formatTime(ms)}.`;
        break;
      }
      case 'remove': {
        const n = interaction.options.getInteger('position', true);
        if (n > p.queue.tracks.length) throw new UserError(`The queue only has ${p.queue.tracks.length} tracks.`);
        const [removed] = p.queue.tracks.slice(n - 1, n);
        await p.queue.remove(n - 1);
        text = `Removed **${escapeTitle(removed?.info.title ?? 'that track')}**.`;
        break;
      }
      case 'jump': {
        const n = interaction.options.getInteger('position', true);
        if (n > p.queue.tracks.length) throw new UserError(`The queue only has ${p.queue.tracks.length} tracks.`);
        // With queue looping, the tracks jumped over go to the back instead of being dropped
        const skipped = p.repeatMode === 'queue' ? p.queue.tracks.slice(0, n - 1) : [];
        await p.skip(n);
        if (skipped.length) await p.queue.add(skipped);
        text = `Jumped to track ${n}.`;
        break;
      }
      default: return;
    }
    void refreshPanel(client, p).catch(() => undefined);
    return reply(`${icon('success')} ${text}`);
  },
});

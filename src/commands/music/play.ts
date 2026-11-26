import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { musicRules } from '../../content/music';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { escapeTitle, formatTime } from '../../music/panel';
import { lavalink, nodeReady, voiceCheck } from '../../music/manager';

export default defineCommand({
  data: new SlashCommandBuilder().setName('play').setDescription('Play a song or playlist (search or link) in your voice channel')
    .addStringOption((o) => o.setName('query').setDescription('Song name, or a YouTube / YouTube Music link').setRequired(true).setMaxLength(300)),
  category: 'music',
  guildOnly: true,
  // Not deferred up front, and all replies are private: the now-playing panel is the public message
  async execute({ interaction }) {
    const manager = lavalink();
    if (!manager || !nodeReady()) throw new UserError('Music is unavailable right now. Try again in a minute.');
    const member = interaction.member as GuildMember;
    const existing = manager.getPlayer(interaction.guildId!);
    const problem = voiceCheck(member, existing);
    if (problem) throw new UserError(problem);
    const channel = member.voice.channel!;
    const me = interaction.guild!.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) throw new UserError(`I need permission to connect and speak in <#${channel.id}>.`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const player = existing ?? manager.createPlayer({
      guildId: interaction.guildId!, voiceChannelId: channel.id, textChannelId: interaction.channelId, selfDeaf: true, volume: musicRules.defaultVolume,
    });
    if (!player.connected) await player.connect();

    const query = interaction.options.getString('query', true);
    let result;
    try {
      result = await player.search({ query }, interaction.user);
    } catch (err) {
      if (!player.queue.current) await player.destroy('search failed').catch(() => undefined);
      throw err;
    }
    if (!result.tracks.length || result.loadType === 'error' || result.loadType === 'empty') {
      if (!player.queue.current) await player.destroy('no results').catch(() => undefined);
      throw new UserError(`Nothing found for **${query.slice(0, 80)}**.`);
    }
    // Nothing playing yet: this starts right away and the panel says so
    const startsNow = !player.queue.current;
    const room = musicRules.maxQueue - player.queue.tracks.length;
    if (room <= 0) throw new UserError(`The queue is full (${musicRules.maxQueue} tracks).`);
    const toAdd = result.loadType === 'playlist' ? result.tracks.slice(0, room) : [result.tracks[0]!];
    await player.queue.add(toAdd);
    if (!player.playing && !player.paused) await player.play();

    const first = toAdd[0]!;
    if (startsNow && result.loadType !== 'playlist') return interaction.deleteReply();
    const text = result.loadType === 'playlist'
      ? `${icon('success')} Added **${toAdd.length}** tracks from **${escapeTitle(result.playlist?.name ?? 'a playlist')}**${toAdd.length < result.tracks.length ? ` (the queue holds ${musicRules.maxQueue})` : ''}.`
      : `${icon('success')} Queued **[${escapeTitle(first.info.title)}](${first.info.uri})** · ${formatTime(first.info.duration ?? 0)} · #${player.queue.tracks.length} in the queue.`;
    return interaction.editReply({ embeds: [embed('music').setTitle(`${titleIcon('music')} Play`).setDescription(text)] });
  },
});

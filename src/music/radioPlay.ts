import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { Track } from 'lavalink-client';
import { musicRules } from '../content/music';
import { UserError } from '../lib/errors';
import { lavalink, nodeReady, voiceCheck } from './manager';
import type { RadioConfig, Station } from './radio';

/** Tunes in: the queue is cleared and the station replaces whatever was playing. */
export async function playStation(member: GuildMember, textChannelId: string, station: Station, config: RadioConfig): Promise<void> {
  const manager = lavalink();
  if (!manager || !nodeReady()) throw new UserError('Music is unavailable right now. Try again in a minute.');
  const existing = manager.getPlayer(member.guild.id);
  const problem = voiceCheck(member, existing);
  if (problem) throw new UserError(problem);
  const channel = member.voice.channel!;
  const me = member.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) throw new UserError(`I need permission to connect and speak in <#${channel.id}>.`);

  const player = existing ?? manager.createPlayer({ guildId: member.guild.id, voiceChannelId: channel.id, textChannelId, selfDeaf: true, volume: musicRules.defaultVolume });
  if (!player.connected) await player.connect();
  const res = await player.search({ query: station.url }, member.user).catch(() => null);
  const track = res && res.loadType !== 'error' && res.loadType !== 'empty' ? (res.tracks[0] as Track | undefined) : undefined;
  if (!track) {
    if (!player.queue.current) await player.destroy('radio failed').catch(() => undefined);
    throw new UserError(`**${station.name}** isn't responding right now. Try another station.`);
  }
  track.userData = { ...(track.userData ?? {}), radio: { id: station.id, name: station.name, genre: config.genres[station.genre] ?? station.genre, ...(station.website ? { website: station.website } : {}) } };
  await player.setRepeatMode('off');
  if (player.queue.tracks.length) await player.queue.splice(0, player.queue.tracks.length);
  if (player.queue.current) await player.play({ clientTrack: track });
  else {
    await player.queue.add(track);
    await player.play();
  }
}

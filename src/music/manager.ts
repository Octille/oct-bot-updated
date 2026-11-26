import { LavalinkManager, type Player, type Track } from 'lavalink-client';
import type { Client, GuildMember, SendableChannels } from 'discord.js';
import { env } from '../config/env';
import { logError, logInfo } from '../lib/logger';
import { musicRules } from '../content/music';
import { nowPlayingPanel } from './panel';

/**
 * Music (Lavalink). One manager per process. If Lavalink isn't reachable the rest of the bot works;
 * music commands just say it's unavailable.
 */
let manager: LavalinkManager | null = null;

export function lavalink(): LavalinkManager | null {
  return manager;
}

/** Message id of the current now-playing panel per guild, so the old one loses its buttons. */
const panels = new Map<string, { channelId: string; messageId: string }>();
/** Pending "leave when alone / idle" timers per guild. */
const leaveTimers = new Map<string, NodeJS.Timeout>();

export function createLavalink(client: Client): void {
  manager = new LavalinkManager({
    nodes: [{
      id: 'main',
      host: env.LAVALINK_HOST,
      port: env.LAVALINK_PORT,
      authorization: env.LAVALINK_PASSWORD,
      retryAmount: 20,
      retryDelay: 5_000,
    }],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    client: { id: env.CLIENT_ID },
    autoSkip: true,
    playerOptions: { defaultSearchPlatform: 'ytmsearch', volumeDecrementer: 1, onDisconnect: { autoReconnect: false, destroyPlayer: true }, onEmptyQueue: { destroyAfterMs: musicRules.idleLeaveMs } },
  });

  client.on('raw', (d) => manager?.sendRawData(d));

  manager.nodeManager.on('connect', (node) => logInfo('music', `Lavalink node "${node.id}" connected`));
  manager.nodeManager.on('error', (node, err) => logError(`lavalink ${node.id}`, err));
  manager.nodeManager.on('disconnect', (node, reason) => logInfo('music', `Lavalink node "${node.id}" disconnected (${reason?.reason ?? 'unknown'})`));

  manager.on('trackStart', (player, track) => {
    void postPanel(client, player, track).catch((err) => logError('music panel', err));
  });
  manager.on('trackError', (player, _track, payload) => {
    void textChannel(client, player)?.send(`Couldn't play that track (${payload.exception?.message ?? 'unknown error'}). Skipping.`).catch(() => undefined);
  });
  manager.on('trackStuck', (player) => {
    void player.skip(0, false).catch(() => undefined);
  });
  manager.on('queueEnd', (player) => {
    void retirePanel(client, player.guildId, 'The queue has finished.').catch(() => undefined);
  });
  manager.on('playerDestroy', (player) => {
    clearLeave(player.guildId);
    void retirePanel(client, player.guildId, 'Stopped.').catch(() => undefined);
  });
}

export async function initLavalink(client: Client<true>): Promise<void> {
  if (!manager) return;
  try {
    await manager.init({ id: client.user.id, username: client.user.username });
  } catch (err) {
    logError('lavalink init', err);
  }
}

export function nodeReady(): boolean {
  return !!manager && [...manager.nodeManager.nodes.values()].some((n) => n.connected);
}

function textChannel(client: Client, player: Player): SendableChannels | null {
  const ch = player.textChannelId ? client.channels.cache.get(player.textChannelId) : null;
  return ch?.isSendable() ? ch : null;
}

/** Posts the now-playing panel and strips the buttons off the previous one. */
async function postPanel(client: Client, player: Player, track: Track | null): Promise<void> {
  const channel = textChannel(client, player);
  if (!channel || !track) return;
  await retirePanel(client, player.guildId, null);
  const msg = await channel.send(nowPlayingPanel(player, track));
  panels.set(player.guildId, { channelId: msg.channelId, messageId: msg.id });
}

/** Refreshes the current panel in place (after pause, loop, volume…). */
export async function refreshPanel(client: Client, player: Player): Promise<void> {
  const p = panels.get(player.guildId);
  const track = player.queue.current;
  if (!p || !track) return;
  const ch = client.channels.cache.get(p.channelId);
  if (!ch?.isTextBased()) return;
  await ch.messages.edit(p.messageId, nowPlayingPanel(player, track)).catch(() => undefined);
}

async function retirePanel(client: Client, guildId: string, note: string | null): Promise<void> {
  const p = panels.get(guildId);
  if (!p) return;
  panels.delete(guildId);
  const ch = client.channels.cache.get(p.channelId);
  if (!ch?.isTextBased()) return;
  await ch.messages.edit(p.messageId, { components: [], ...(note ? { content: note } : {}) }).catch(() => undefined);
}

function clearLeave(guildId: string): void {
  const t = leaveTimers.get(guildId);
  if (t) clearTimeout(t);
  leaveTimers.delete(guildId);
}

/** Leaves when nobody (who isn't a bot) is left in the voice channel for a while. */
export function checkAlone(client: Client, guildId: string): void {
  const player = manager?.getPlayer(guildId);
  if (!player?.voiceChannelId) return;
  const channel = client.channels.cache.get(player.voiceChannelId);
  const humans = channel?.isVoiceBased() ? channel.members.filter((m) => !m.user.bot).size : 0;
  if (humans > 0) return clearLeave(guildId);
  if (leaveTimers.has(guildId)) return;
  leaveTimers.set(guildId, setTimeout(() => {
    leaveTimers.delete(guildId);
    const p = manager?.getPlayer(guildId);
    if (!p) return;
    void textChannel(client, p)?.send('Everyone left the voice channel, so I left too.').catch(() => undefined);
    void p.destroy('alone').catch(() => undefined);
  }, musicRules.aloneLeaveMs));
}

/** The member must be in a voice channel, and in the bot's channel if it's already playing. */
export function voiceCheck(member: GuildMember, player: Player | undefined): string | null {
  const channel = member.voice.channel;
  if (!channel) return 'Join a voice channel first.';
  if (player?.voiceChannelId && player.voiceChannelId !== channel.id) return `I'm playing in <#${player.voiceChannelId}>. Join that channel to control the music.`;
  return null;
}

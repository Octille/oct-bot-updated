import { LavalinkManager, type Player, type Track } from 'lavalink-client';
import { PermissionFlagsBits, type Client, type GuildMember, type SendableChannels } from 'discord.js';
import { env } from '../config/env';
import { logError, logInfo } from '../lib/logger';
import { musicRules } from '../content/music';
import { escapeTitle, nowPlayingPanel } from './panel';

/**
 * Music (Lavalink). One manager per process. If Lavalink isn't reachable the rest of the bot works;
 * music commands just say it's unavailable.
 */
let manager: LavalinkManager | null = null;

export function lavalink(): LavalinkManager | null {
  return manager;
}

/** Message id of the current now-playing panel per guild, so the old one loses its buttons. */
const panels = new Map<string, { channelId: string; messageId: string; track: string }>();
/** Last track-error notice per guild (at most one a minute). */
const errorNotes = new Map<string, number>();
/** Panel posts per guild run one after another, so fast skips can't leave two live panels. */
const panelQueue = new Map<string, Promise<void>>();

/** Pending "leave when alone / idle" timers per guild. */
const leaveTimers = new Map<string, NodeJS.Timeout>();

function nodeOptions() {
  return { id: 'main', host: env.LAVALINK_HOST, port: env.LAVALINK_PORT, authorization: env.LAVALINK_PASSWORD, retryAmount: 20, retryDelay: 5_000 };
}

export function createLavalink(client: Client): void {
  manager = new LavalinkManager({
    nodes: [nodeOptions()],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    client: { id: env.CLIENT_ID },
    autoSkip: true,
    playerOptions: { defaultSearchPlatform: 'ytmsearch', volumeDecrementer: 1, onDisconnect: { autoReconnect: false, destroyPlayer: true }, onEmptyQueue: { destroyAfterMs: musicRules.idleLeaveMs },
      // A few broken tracks in a playlist shouldn't kill the player
      maxErrorsPerTime: { threshold: 60_000, maxAmount: musicRules.maxErrorsPerMinute } },
  });

  client.on('raw', (d) => manager?.sendRawData(d));

  manager.nodeManager.on('connect', (node) => logInfo('music', `Lavalink node "${node.id}" connected`));
  manager.nodeManager.on('error', (node, err) => logError(`lavalink ${node.id}`, err));
  manager.nodeManager.on('disconnect', (node, reason) => {
    logInfo('music', `Lavalink node "${node.id}" disconnected (${reason?.reason ?? 'unknown'})`);
    // Players on a dead node go silent: end them cleanly and say why
    for (const player of [...(manager?.players.values() ?? [])]) {
      if (player.node?.id !== node.id) continue;
      void textChannel(client, player)?.send('Lost the connection to the music server. Use `/play` again in a moment.').catch(() => undefined);
      void player.destroy('node disconnected').catch(() => undefined);
    }
  });
  // After all reconnect attempts the library removes the node; add it back so music recovers without a restart
  manager.nodeManager.on('destroy', (node) => {
    logInfo('music', `Lavalink node "${node.id}" gave up reconnecting; trying again in a minute`);
    setTimeout(() => {
      try {
        const fresh = manager?.nodeManager.createNode(nodeOptions());
        fresh?.connect();
      } catch (err) {
        logError('lavalink re-add', err);
      }
    }, 60_000);
  });

  manager.on('trackStart', (player, track) => {
    const prev = panelQueue.get(player.guildId) ?? Promise.resolve();
    const next = prev.then(() => postPanel(client, player, track)).catch((err) => logError('music panel', err));
    panelQueue.set(player.guildId, next);
  });
  manager.on('trackError', (player, track, payload) => {
    const last = errorNotes.get(player.guildId) ?? 0;
    if (Date.now() - last < 60_000) return;
    errorNotes.set(player.guildId, Date.now());
    void textChannel(client, player)?.send(`Couldn't play **${escapeTitle(track?.info.title ?? 'a track')}** (${payload.exception?.message ?? 'unknown error'}). Skipping.`).catch(() => undefined);
  });
  manager.on('queueEnd', (player) => {
    void retirePanel(client, player.guildId, 'The queue has finished.').catch(() => undefined);
  });
  manager.on('playerDestroy', (player) => {
    clearLeave(player.guildId);
    errorNotes.delete(player.guildId);
    panelQueue.delete(player.guildId);
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
  // Looping the same track: refresh the panel instead of posting a new one each time
  const current = panels.get(player.guildId);
  if (current && current.track === track.encoded && player.repeatMode === 'track') return refreshPanel(client, player);
  await retirePanel(client, player.guildId, null);
  const msg = await channel.send(nowPlayingPanel(player, track));
  // Destroyed while sending: don't keep a live panel for a dead player
  if (!manager?.getPlayer(player.guildId)) {
    await msg.edit({ components: [] }).catch(() => undefined);
    return;
  }
  panels.set(player.guildId, { channelId: msg.channelId, messageId: msg.id, track: track.encoded ?? '' });
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

/**
 * The member must be in a voice channel, and in the bot's channel if it's already playing.
 * Members with Manage Channels can control playback from anywhere (to stop abuse).
 */
export function voiceCheck(member: GuildMember, player: Player | undefined, allowModerators = true): string | null {
  if (allowModerators && player?.voiceChannelId && member.permissions.has(PermissionFlagsBits.ManageChannels)) return null;
  const channel = member.voice.channel;
  if (!channel) return 'Join a voice channel first.';
  if (player?.voiceChannelId && player.voiceChannelId !== channel.id) return `I'm playing in <#${player.voiceChannelId}>. Join that channel to control the music.`;
  return null;
}

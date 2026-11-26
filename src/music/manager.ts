import { LavalinkManager, type Player, type Track } from 'lavalink-client';
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes, type Client, type GuildMember, type SendableChannels } from 'discord.js';
import { env } from '../config/env';
import { logError, logInfo } from '../lib/logger';
import { musicRules } from '../content/music';
import { escapeTitle, nowPlayingPanel, panelState, type PanelState } from './panel';
import { clearHistory, recordStart } from './history';
import { findSong, matchData, type Searcher } from './resolve';
import { isYouTube, noteYouTubeError } from './youtube';

/**
 * Music (Lavalink). One manager per process. If Lavalink isn't reachable the rest of the bot works;
 * music commands just say it's unavailable.
 */
let manager: LavalinkManager | null = null;

export function lavalink(): LavalinkManager | null {
  return manager;
}

/** The current now-playing panel per guild (the old one loses its buttons). `state` is kept for the ended view. */
interface LivePanel { channelId: string; messageId: string; track: Track; state: PanelState; lastEdit: number; newer: number }
const panels = new Map<string, LivePanel>();
/** Guilds with a panel edit in flight (the ticker never stacks edits). */
const editing = new Set<string>();
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
    queueOptions: { maxPreviousTracks: musicRules.historySize },
    playerOptions: { defaultSearchPlatform: 'scsearch', volumeDecrementer: 1, onDisconnect: { autoReconnect: false, destroyPlayer: true }, onEmptyQueue: { destroyAfterMs: musicRules.idleLeaveMs },
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
    if (track) recordStart(player.guildId, track, player.repeatMode === 'track');
    const prev = panelQueue.get(player.guildId) ?? Promise.resolve();
    const next = prev.then(() => postPanel(client, player, track)).catch((err) => logError('music panel', err));
    panelQueue.set(player.guildId, next);
  });
  manager.on('trackError', (player, track, payload) => {
    const message = payload.exception?.message ?? 'unknown error';
    // YouTube failed (blocked, sign-in wall, cipher change…): play the same song from SoundCloud instead, quietly
    if (track && isYouTube(track as Track)) {
      void playFromSoundCloud(client, player, track as Track, message).catch((err) => logError('music fallback', err));
      return;
    }
    noteSkipped(client, player, track, message);
  });
  // Not seen so far, but log it so a stalled stream shows up in the error channel
  manager.on('trackStuck', (player, track, payload) => {
    logError('music stuck', new Error(`"${track?.info.title ?? '?'}" (${track?.info.identifier ?? '?'}) stuck for ${payload.thresholdMs} ms in ${player.guildId}`));
  });
  manager.on('queueEnd', (player) => {
    void retirePanel(client, player.guildId, 'The queue has finished.').catch(() => undefined);
  });
  manager.on('playerDestroy', (player) => {
    clearLeave(player.guildId);
    clearHistory(player.guildId);
    errorNotes.delete(player.guildId);
    panelQueue.delete(player.guildId);
    void retirePanel(client, player.guildId, 'Stopped.').catch(() => undefined);
  });

  setInterval(() => refreshTick(client), musicRules.panelRefreshMs).unref();
}

/** Tells the channel a track was skipped (at most once a minute per server). */
function noteSkipped(client: Client, player: Player, track: { info: { title?: string } } | null | undefined, reason?: string): void {
  const last = errorNotes.get(player.guildId) ?? 0;
  if (Date.now() - last < 60_000) return;
  errorNotes.set(player.guildId, Date.now());
  void textChannel(client, player)?.send(`Couldn't play **${escapeTitle(track?.info.title ?? 'a track')}**${reason ? ` (${reason})` : ''}. Skipping.`).catch(() => undefined);
}

/**
 * A YouTube track failed to play: note it (repeated failures or a block switch YouTube off for a
 * while, see youtube.ts), then find the same song on SoundCloud and put it next in the queue.
 * Lavalink's track-end moves the queue on, so it plays straight after; if the queue already ended, start it.
 */
async function playFromSoundCloud(client: Client, player: Player, track: Track, message: string): Promise<void> {
  noteYouTubeError(`${message} (${track.info.identifier})`);
  const match = matchData(track);
  const song = match?.song ?? { title: track.info.title, author: track.info.author, duration: track.info.duration ?? 0 };
  const search: Searcher = async (query, source) => {
    try {
      const res = await player.search({ query, source: source as 'scsearch' }, track.requester);
      if (res.loadType === 'error') return { tracks: [], failure: 'source' };
      return { tracks: res.tracks as Track[], failure: null };
    } catch {
      return { tracks: [], failure: 'client' };
    }
  };
  const found = await findSong(search, song, match?.link, { youtube: false });
  if (manager?.getPlayer(player.guildId) !== player) return; // stopped meanwhile
  if (!found || found === 'client') {
    noteSkipped(client, player, track);
    return;
  }
  await player.queue.add(found.track, 0);
  if (!player.queue.current && !player.playing) await player.play();
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
  // (unless chat has buried it: then a fresh one is posted)
  if (current && current.track.encoded === track.encoded && player.repeatMode === 'track' && current.newer < musicRules.panelStaleAfter) return refreshPanel(client, player);
  await retirePanel(client, player.guildId, null);
  const state = panelState(player);
  const msg = await channel.send(nowPlayingPanel(state, track));
  // Destroyed while sending: don't keep a live panel for a dead player
  if (!manager?.getPlayer(player.guildId)) {
    await msg.edit(nowPlayingPanel(state, track, 'Stopped.')).catch(() => undefined);
    return;
  }
  panels.set(player.guildId, { channelId: msg.channelId, messageId: msg.id, track, state, lastEdit: Date.now(), newer: 0 });
}

/** Every message in a channel with a live panel counts toward burying it (see musicRules.panelStaleAfter). */
export function notePanelChannelMessage(channelId: string, messageId: string): void {
  for (const p of panels.values()) if (p.channelId === channelId && p.messageId !== messageId) p.newer++;
}

/** The panel message is gone or out of reach: stop tracking it. */
function panelGone(err: unknown): boolean {
  return err instanceof DiscordAPIError && ([RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.MissingPermissions] as number[]).includes(Number(err.code));
}

/** Players whose panel the ticker should move along: playing, not paused, someone listening, panel is this track's. */
function refreshable(client: Client, guildId: string, p: LivePanel): boolean {
  const player = manager?.getPlayer(guildId);
  const track = player?.queue.current;
  if (!player || !track || !player.playing || player.paused || track.info.isStream) return false;
  if (track.encoded !== p.track.encoded || p.newer >= musicRules.panelStaleAfter) return false;
  const voice = player.voiceChannelId ? client.channels.cache.get(player.voiceChannelId) : null;
  return voice?.isVoiceBased() ? voice.members.some((m) => !m.user.bot) : false;
}

/**
 * Which panels to refresh this tick under the global cap: least recently edited first, so with more
 * playing servers than the cap allows, every panel still moves along in turn.
 */
export function pickRefreshes(candidates: { guildId: string; lastEdit: number }[], cap: number): string[] {
  return [...candidates].sort((a, b) => a.lastEdit - b.lastEdit).slice(0, Math.max(0, cap)).map((c) => c.guildId);
}

function refreshTick(client: Client): void {
  const cap = Math.floor(musicRules.panelEditsPerSecond * (musicRules.panelRefreshMs / 1000));
  const due = pickRefreshes([...panels].filter(([g, p]) => !editing.has(g) && refreshable(client, g, p)).map(([guildId, p]) => ({ guildId, lastEdit: p.lastEdit })), cap);
  // Spread the edits over the tick instead of sending them all at once
  const gap = 1000 / musicRules.panelEditsPerSecond;
  due.forEach((guildId, i) => setTimeout(() => {
    const player = manager?.getPlayer(guildId);
    if (player) void refreshPanel(client, player).catch((err) => logError('music panel refresh', err));
  }, i * gap).unref());
}

/** Refreshes the current panel in place (after pause, loop, volume…, and every 15s while playing). */
export async function refreshPanel(client: Client, player: Player): Promise<void> {
  const p = panels.get(player.guildId);
  const track = player.queue.current;
  if (!p || !track || editing.has(player.guildId)) return;
  const ch = client.channels.cache.get(p.channelId);
  if (!ch?.isTextBased()) {
    panels.delete(player.guildId);
    return;
  }
  editing.add(player.guildId);
  try {
    p.state = panelState(player);
    p.track = track;
    p.lastEdit = Date.now();
    await ch.messages.edit(p.messageId, nowPlayingPanel(p.state, track));
  } catch (err) {
    if (panelGone(err)) panels.delete(player.guildId);
  } finally {
    editing.delete(player.guildId);
  }
}

/** Marks a panel edited by a button press (interaction.update), so the ticker doesn't redo it right away. */
export function notePanelEdited(player: Player): void {
  const p = panels.get(player.guildId);
  if (p && player.queue.current) Object.assign(p, { state: panelState(player), track: player.queue.current, lastEdit: Date.now() });
}

/** Whether this message is the guild's current panel. */
export function isCurrentPanel(guildId: string, messageId: string): boolean {
  return panels.get(guildId)?.messageId === messageId;
}

/** Ends the panel: buttons removed, the note shown in place of the progress line. */
async function retirePanel(client: Client, guildId: string, note: string | null): Promise<void> {
  const p = panels.get(guildId);
  if (!p) return;
  panels.delete(guildId);
  const ch = client.channels.cache.get(p.channelId);
  if (!ch?.isTextBased()) return;
  await ch.messages.edit(p.messageId, nowPlayingPanel(p.state, p.track, note ?? 'Finished.')).catch(() => undefined);
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

import type { Message } from 'discord.js';
import { icon } from '../lib/icons';
import { duration, relative } from '../lib/format';
import { logError } from '../lib/logger';
import { Afk } from '../models/Afk';

export const afkRules = {
  /** Don't mention someone's AFK note in the same channel more than once a minute. */
  noteCooldownMs: 60_000,
  /** Talking this soon after going AFK doesn't count as being back (e.g. finishing a sentence). */
  graceMs: 10_000,
  maxReason: 200,
} as const;

interface AfkEntry { reason: string | null; since: Date }
/** AFK members per guild, loaded from the database the first time the guild is seen. */
const guilds = new Map<string, Promise<Map<string, AfkEntry>>>();
const notes = new Map<string, number>();

function load(guildId: string): Promise<Map<string, AfkEntry>> {
  let p = guilds.get(guildId);
  if (!p) {
    p = Afk.find({ guildId }).lean().then((rows) => new Map(rows.map((r) => [r.userId, { reason: r.reason ?? null, since: r.since }])));
    p.catch(() => guilds.delete(guildId));
    guilds.set(guildId, p);
  }
  return p;
}

/** A reason that can't add mentions or markdown links (pings are blocked anyway). */
export function cleanReason(reason: string | null | undefined): string | null {
  const r = reason?.replace(/\s+/g, ' ').trim().slice(0, afkRules.maxReason);
  return r ? r.replace(/@/g, '@​').replace(/[[\]()<>]/g, '') : null;
}

export async function setAfk(guildId: string, userId: string, reason: string | null): Promise<void> {
  const entry = { reason: cleanReason(reason), since: new Date() };
  await Afk.updateOne({ guildId, userId }, { $set: entry }, { upsert: true });
  (await load(guildId)).set(userId, entry);
}

export async function clearAfk(guildId: string, userId: string): Promise<AfkEntry | null> {
  const map = await load(guildId);
  const entry = map.get(userId) ?? null;
  if (!entry) return null;
  map.delete(userId);
  await Afk.deleteOne({ guildId, userId });
  return entry;
}

/** On every message: welcome back the author if they were AFK, and point out AFK members they mentioned. */
export async function handleAfk(message: Message<true>): Promise<void> {
  try {
    const map = await load(message.guildId);
    if (!map.size) return;
    const own = map.get(message.author.id);
    if (own && Date.now() - own.since.getTime() > afkRules.graceMs) {
      await clearAfk(message.guildId, message.author.id);
      const reply = await message.reply({ content: `${icon('success')} Welcome back! You were away for ${duration(Date.now() - own.since.getTime())}.`, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
      if (reply) setTimeout(() => void reply.delete().catch(() => undefined), 10_000).unref();
    }
    const lines: string[] = [];
    for (const user of message.mentions.users.values()) {
      const entry = map.get(user.id);
      if (!entry || user.id === message.author.id) continue;
      const key = `${message.channelId}:${user.id}`;
      if (Date.now() - (notes.get(key) ?? 0) < afkRules.noteCooldownMs) continue;
      if (notes.size > 5_000) for (const [k, at] of notes) if (Date.now() - at > afkRules.noteCooldownMs) notes.delete(k);
      notes.set(key, Date.now());
      lines.push(`${icon('afk')} **${user.displayName}** is away${entry.reason ? `: ${entry.reason}` : ''} (since ${relative(entry.since)})`);
    }
    if (lines.length) await message.reply({ content: lines.slice(0, 5).join('\n'), allowedMentions: { parse: [], repliedUser: false } }).catch(() => undefined);
  } catch (err) {
    logError('afk', err);
  }
}

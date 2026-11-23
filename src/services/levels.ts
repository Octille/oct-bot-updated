import { chatXp, serverLevelFromXp } from '../content/levels';
import { MemberLevel } from '../models/MemberLevel';
import { User } from '../models/User';
import { getGuildSettings } from '../models/GuildSettings';
import { defaultRng, randInt, type Rng } from '../lib/rng';

/** Per-server chat and voice XP. Separate from account XP, which only comes from game actions. */

export interface LevelSettings {
  announce: 'same' | 'channel' | 'dm' | 'off';
  channelId?: string | null;
  rewards: { level: number; roleId: string }[];
  stackRewards: boolean;
  noXpChannelIds: string[];
  multipliers: { targetId: string; mult: number }[];
  voiceXp: boolean;
  doubleXpUntil?: Date | null;
  weekendDoubleXp: boolean;
}

/* ── Settings cache (read on every message, so kept in memory for a minute) ─────────────── */

const settingsCache = new Map<string, { at: number; levels: LevelSettings }>();
const SETTINGS_TTL_MS = 60_000;

export async function levelSettings(guildId: string): Promise<LevelSettings> {
  const hit = settingsCache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.levels;
  const settings = await getGuildSettings(guildId);
  const levels = settings!.levels as unknown as LevelSettings;
  settingsCache.set(guildId, { at: Date.now(), levels });
  return levels;
}

/** Call after changing a server's level settings. */
export function invalidateLevelSettings(guildId: string): void {
  settingsCache.delete(guildId);
}

/* ── Multipliers ────────────────────────────────────────────────────────────────────────── */

export function isDoubleXp(levels: Pick<LevelSettings, 'doubleXpUntil' | 'weekendDoubleXp'>, now = new Date()): boolean {
  if (levels.doubleXpUntil && levels.doubleXpUntil.getTime() > now.getTime()) return true;
  const day = now.getUTCDay();
  return !!levels.weekendDoubleXp && (day === 0 || day === 6);
}

/**
 * The XP multiplier for a member in a channel: the highest matching channel, category or role
 * multiplier (1 if none), doubled during double XP.
 */
export function xpMultiplier(levels: Pick<LevelSettings, 'multipliers' | 'doubleXpUntil' | 'weekendDoubleXp'>, targets: string[], now = new Date()): number {
  const matches = (levels.multipliers ?? []).filter((m) => targets.includes(m.targetId)).map((m) => m.mult);
  const base = matches.length ? Math.max(...matches) : 1;
  return base * (isDoubleXp(levels, now) ? 2 : 1);
}

/* ── Awarding XP ────────────────────────────────────────────────────────────────────────── */

export interface ServerLevelUp {
  guildId: string;
  userId: string;
  from: number;
  to: number;
  xp: number;
}

const DUPLICATE_KEY = 11000;

/** Fast in-memory cooldown so most messages never touch the database. The DB check is the real one. */
const recent = new Map<string, number>();

/**
 * Gives chat XP for one message, at most once per cooldown window per member per server.
 * Returns the level-up, if any, or `undefined` when the message didn't count.
 */
export async function awardChatXp(guildId: string, userId: string, mult: number, now = new Date(), rng: Rng = defaultRng): Promise<ServerLevelUp | null | undefined> {
  const key = `${guildId}:${userId}`;
  const windowMs = chatXp.cooldownSeconds * 1000;
  if ((recent.get(key) ?? 0) > now.getTime() - windowMs) return undefined;
  recent.set(key, now.getTime());
  if (recent.size > 50_000) recent.clear();

  const xp = Math.round(randInt(chatXp.message[0], chatXp.message[1], rng) * mult);
  let doc;
  try {
    doc = await MemberLevel.findOneAndUpdate(
      { guildId, userId, $or: [{ lastXpAt: null }, { lastXpAt: { $lte: new Date(now.getTime() - windowMs) } }] },
      { $inc: { xp, messages: 1 }, $set: { lastXpAt: now } },
      { upsert: true, new: true, lean: true },
    );
  } catch (err) {
    // The member exists but is still on cooldown: the upsert collided with the unique index
    if ((err as { code?: number }).code === DUPLICATE_KEY) return undefined;
    throw err;
  }
  // Global stat for achievements and quests: once a minute across ALL servers (so being in many
  // servers doesn't multiply it), and only for people who already play (never creates a profile)
  await User.updateOne(
    { _id: userId, 'stats.lastMessageAt': { $not: { $gt: new Date(now.getTime() - windowMs) } } },
    { $inc: { 'stats.messages': 1 }, $set: { 'stats.lastMessageAt': now } },
  );
  return syncServerLevel(guildId, userId, doc!.xp, doc!.level, xp);
}

/** Gives a minute of voice XP. */
export async function awardVoiceXp(guildId: string, userId: string, mult: number): Promise<ServerLevelUp | null> {
  const xp = Math.round(chatXp.voicePerMinute * mult);
  const doc = await MemberLevel.findOneAndUpdate(
    { guildId, userId },
    { $inc: { xp, voiceMinutes: 1 } },
    { upsert: true, new: true, lean: true },
  );
  await User.updateOne({ _id: userId }, { $inc: { 'stats.voiceMinutes': 1 } });
  return syncServerLevel(guildId, userId, doc!.xp, doc!.level, xp);
}

/** Raises the stored level to match XP. Only the caller that wins the conditional update reports it. */
async function syncServerLevel(guildId: string, userId: string, totalXp: number, stored: number, xp: number): Promise<ServerLevelUp | null> {
  const { level } = serverLevelFromXp(totalXp);
  if (level <= stored) return null;
  const before = await MemberLevel.findOneAndUpdate(
    { guildId, userId, level: { $lt: level } },
    { $max: { level } },
    { new: false, lean: true, projection: { level: 1 } },
  );
  if (!before) return null;
  return { guildId, userId, from: before.level, to: level, xp };
}

/** Sets a member's server level (admin tool). XP is set to the start of that level. */
export async function setServerLevel(guildId: string, userId: string, level: number, totalXp: number): Promise<void> {
  await MemberLevel.updateOne({ guildId, userId }, { $set: { xp: totalXp, level } }, { upsert: true });
}

/* ── Lookups ────────────────────────────────────────────────────────────────────────────── */

export async function memberLevel(guildId: string, userId: string) {
  const doc = await MemberLevel.findOne({ guildId, userId }, null, { lean: true });
  const xp = doc?.xp ?? 0;
  // Rank = members with more XP + 1 (uses the guildId+xp index)
  const [above, members] = await Promise.all([
    doc ? MemberLevel.countDocuments({ guildId, xp: { $gt: xp } }) : Promise.resolve(0),
    MemberLevel.countDocuments({ guildId, xp: { $gt: 0 } }),
  ]);
  const rank = doc && xp > 0 ? above + 1 : null;
  return { xp, messages: doc?.messages ?? 0, voiceMinutes: doc?.voiceMinutes ?? 0, rank, members, ...serverLevelFromXp(xp) };
}

/* ── Reward roles ───────────────────────────────────────────────────────────────────────── */

/**
 * Which reward roles to add and remove after reaching `to` from `from`.
 * Stacking keeps every earned role; otherwise only the highest earned role is kept.
 */
export function rewardRoleChanges(rewards: { level: number; roleId: string }[], from: number, to: number, stack: boolean): { add: string[]; remove: string[] } {
  const earned = rewards.filter((r) => r.level <= to).sort((a, b) => a.level - b.level);
  if (stack) return { add: earned.filter((r) => r.level > from).map((r) => r.roleId), remove: [] };
  const top = earned.at(-1);
  if (!top) return { add: [], remove: [] };
  return {
    add: top.level > from ? [top.roleId] : [],
    remove: rewards.filter((r) => r.roleId !== top.roleId).map((r) => r.roleId),
  };
}

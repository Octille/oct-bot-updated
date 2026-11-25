import { crimeUnlockLevel } from '../content/crime';
import { questDefs, questRerolls, questRewards, questsPerSet, type QuestDef, type QuestScope } from '../content/quests';
import { itemName } from '../content/items';
import { dayNumber } from '../game/streaks';
import { EconomyError, UserError } from '../lib/errors';
import { seededRng, type Rng } from '../lib/rng';
import { User } from '../models/User';
import { apply, getProfile, type Profile } from './economy';
import { syncLevel, unlockLevel, type LevelUp } from './progression';
import { addSeasonPoints } from './seasons';
import { seasonRules } from '../content/events';

export interface Quest {
  id: string;
  target: number;
  base: number;
  claimed: boolean;
}

/** Weeks start on Monday 00:00 UTC (day 0 of the epoch was a Thursday). */
export function weekNumber(date: Date | number): number {
  return Math.floor((dayNumber(date) + 3) / 7);
}

/** When the current set resets. */
export function nextReset(scope: QuestScope, now = new Date()): Date {
  return scope === 'daily'
    ? new Date((dayNumber(now) + 1) * 86_400_000)
    : new Date((weekNumber(now) * 7 + 7 - 3) * 86_400_000);
}

export function statValue(p: Pick<Profile, 'stats'>, path: string): number {
  const [a, b] = path.split('.') as [string, string | undefined];
  const v = (p.stats as unknown as Record<string, unknown> | undefined)?.[a];
  return Number((b ? (v as Record<string, number> | undefined)?.[b] : v) ?? 0) || 0;
}

export function questDef(id: string): QuestDef | undefined {
  return questDefs.find((q) => q.id === id);
}

export function questLabel(q: Pick<Quest, 'id' | 'target'>): string {
  const def = questDef(q.id);
  const n = def?.stat === 'earned' ? `₪ ${q.target.toLocaleString('en-US')}` : q.target.toLocaleString('en-US');
  return (def?.label ?? q.id).replace('{n}', n).replace('(s)', q.target === 1 ? '' : 's');
}

export function questProgress(p: Pick<Profile, 'stats'>, q: Quest): number {
  const def = questDef(q.id);
  return def ? Math.max(0, Math.min(q.target, statValue(p, def.stat) - q.base)) : 0;
}

export const questDone = (p: Pick<Profile, 'stats'>, q: Quest) => questProgress(p, q) >= q.target;

/** Quests this player can actually do right now (tools and level). */
function available(p: Profile, scope: QuestScope): QuestDef[] {
  return questDefs.filter((d) => {
    if (!d[scope] && !d.scaled?.[scope]) return false;
    if (d.needs === 'weapon' && !p.tools?.weapon?.id) return false;
    if (d.needs === 'shovel' && !p.tools?.shovel?.id) return false;
    if (d.needs === 'crime' && unlockLevel(p) < crimeUnlockLevel) return false;
    return true;
  });
}

function makeQuest(p: Profile, scope: QuestScope, def: QuestDef, rng: Rng): Quest {
  let target: number;
  const scaled = def.scaled?.[scope];
  if (scaled) target = Math.round((scaled[0] + scaled[1] * unlockLevel(p)) / 500) * 500;
  else {
    const [min, max] = def[scope]!;
    target = min + Math.floor(rng.next() * (max - min + 1));
  }
  return { id: def.id, target, base: statValue(p, def.stat), claimed: false };
}

function seed(userId: string, scope: QuestScope, period: number, salt = 0): number {
  let h = 2166136261 ^ period ^ (scope === 'daily' ? 0 : 0x9e3779b9) ^ salt;
  for (const ch of userId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A fresh set of quests, the same for the same player and day/week (so racing requests agree). */
export function generateSet(p: Profile, scope: QuestScope, period: number): Quest[] {
  const rng = seededRng(seed(p._id, scope, period));
  const pool = [...available(p, scope)];
  const out: Quest[] = [];
  while (out.length < questsPerSet && pool.length) {
    const def = pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!;
    out.push(makeQuest(p, scope, def, rng));
  }
  return out;
}

/**
 * Hands out new quests when the day/week has changed. Called on every interaction; writes only on
 * the first one after a reset, guarded so concurrent calls can't both reset.
 */
export async function ensureQuests(p: Profile, now = new Date()): Promise<Profile> {
  const day = dayNumber(now);
  const week = weekNumber(now);
  const set: Record<string, unknown> = {};
  if (p.quests?.daily?.day !== day) Object.assign(set, { 'quests.daily': { day, list: generateSet(p, 'daily', day), rerolls: 0, bonusClaimed: false } });
  if (p.quests?.weekly?.week !== week) Object.assign(set, { 'quests.weekly': { week, list: generateSet(p, 'weekly', week), rerolls: 0, bonusClaimed: false } });
  if (!Object.keys(set).length) return p;
  const fresh = await User.findOneAndUpdate(
    { _id: p._id, $or: [{ 'quests.daily.day': { $ne: day } }, { 'quests.weekly.week': { $ne: week } }] },
    // Only reset the sets that are actually stale (the filter above lets either through)
    [{ $set: {
      'quests.daily': { $cond: [{ $eq: ['$quests.daily.day', day] }, '$quests.daily', set['quests.daily'] ? { $literal: set['quests.daily'] } : '$quests.daily'] },
      'quests.weekly': { $cond: [{ $eq: ['$quests.weekly.week', week] }, '$quests.weekly', set['quests.weekly'] ? { $literal: set['quests.weekly'] } : '$quests.weekly'] },
    } }],
    { new: true, lean: true },
  );
  return (fresh as unknown as Profile | null) ?? (await getProfile(p._id));
}

const periodField = (scope: QuestScope) => (scope === 'daily' ? 'quests.daily.day' : 'quests.weekly.week');
const periodOf = (scope: QuestScope, now: Date) => (scope === 'daily' ? dayNumber(now) : weekNumber(now));

export function questSet(p: Profile, scope: QuestScope): { list: Quest[]; rerolls: number; bonusClaimed: boolean } {
  const s = p.quests?.[scope];
  return { list: (s?.list ?? []) as Quest[], rerolls: s?.rerolls ?? 0, bonusClaimed: !!s?.bonusClaimed };
}

export interface ClaimResult {
  coins: number;
  xp: number;
  item?: string;
  levelUp: LevelUp | null;
}

/** Claims one finished quest. One conditional update: can't be claimed twice or after a reset. */
export async function claimQuest(userId: string, scope: QuestScope, index: number, now = new Date()): Promise<ClaimResult> {
  const p = await ensureQuests(await getProfile(userId), now);
  const q = questSet(p, scope).list[index];
  if (!q) throw new UserError('That quest is gone. Open quests again.');
  if (q.claimed) throw new UserError('Already claimed.');
  if (!questDone(p, q)) throw new UserError(`Not done yet: ${questProgress(p, q)} / ${q.target}.`);
  const reward = questRewards[scope];
  const coins = reward.coins(unlockLevel(p));
  try {
    const after = await apply(userId, {
      wallet: coins,
      set: { [`quests.${scope}.list.${index}.claimed`]: true },
      inc: { 'account.xp': reward.xp, ...(scope === 'daily' ? { 'stats.questsDone': 1 } : {}) },
      where: { [periodField(scope)]: periodOf(scope, now), [`quests.${scope}.list.${index}.claimed`]: false, [`quests.${scope}.list.${index}.id`]: q.id },
    }, { source: `quest.${scope}`, meta: { quest: q.id } });
    await addSeasonPoints(userId, scope === 'daily' ? seasonRules.points.dailyQuest : seasonRules.points.weeklyQuest, now);
    return { coins, xp: reward.xp, levelUp: await syncLevel(after) };
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError('That quest changed. Open quests again.');
    throw err;
  }
}

/** The bonus chest for finishing every quest in the set. */
export async function claimBonus(userId: string, scope: QuestScope, now = new Date()): Promise<ClaimResult> {
  const p = await ensureQuests(await getProfile(userId), now);
  const s = questSet(p, scope);
  if (s.bonusClaimed) throw new UserError('Already claimed.');
  if (!s.list.length || s.list.some((q) => !q.claimed)) throw new UserError('Claim all three quests first.');
  const item = questRewards[scope].bonus(unlockLevel(p));
  try {
    await apply(userId, {
      items: { [item]: 1 },
      set: { [`quests.${scope}.bonusClaimed`]: true },
      where: { [periodField(scope)]: periodOf(scope, now), [`quests.${scope}.bonusClaimed`]: false },
    }, { source: `quest.${scope}.bonus` });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError('Already claimed.');
    throw err;
  }
  return { coins: 0, xp: 0, item, levelUp: null };
}

/** Swaps one unfinished quest for a different one (limited per set). */
export async function rerollQuest(userId: string, scope: QuestScope, index: number, now = new Date()): Promise<Quest> {
  const p = await ensureQuests(await getProfile(userId), now);
  const s = questSet(p, scope);
  const q = s.list[index];
  if (!q) throw new UserError('That quest is gone. Open quests again.');
  if (q.claimed) throw new UserError("You've already claimed that one.");
  if (s.rerolls >= questRerolls[scope]) throw new UserError(`You've used your ${scope} reroll.`);
  const taken = new Set(s.list.map((x) => x.id));
  const pool = available(p, scope).filter((d) => !taken.has(d.id));
  if (!pool.length) throw new UserError('No other quests to swap in.');
  const rng = seededRng(seed(userId, scope, periodOf(scope, now), 1 + s.rerolls + index * 7));
  const fresh = makeQuest(p, scope, pool[Math.floor(rng.next() * pool.length)]!, rng);
  const res = await User.updateOne(
    { _id: userId, [periodField(scope)]: periodOf(scope, now), [`quests.${scope}.rerolls`]: s.rerolls, [`quests.${scope}.list.${index}.id`]: q.id, [`quests.${scope}.list.${index}.claimed`]: false },
    { $set: { [`quests.${scope}.list.${index}`]: fresh }, $inc: { [`quests.${scope}.rerolls`]: 1 } },
  );
  if (!res.modifiedCount) throw new UserError('That quest changed. Open quests again.');
  return fresh;
}

export function bonusName(p: Profile, scope: QuestScope): string {
  return itemName(questRewards[scope].bonus(unlockLevel(p)));
}

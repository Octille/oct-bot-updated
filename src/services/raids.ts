import { bosses, goalRules, goalTypes, raidRules } from '../content/events';
import { UserError } from '../lib/errors';
import { defaultRng, type Rng } from '../lib/rng';
import { CommunityGoal, Raid } from '../models/Events';
import { MemberLevel } from '../models/MemberLevel';
import { User } from '../models/User';
import * as cooldowns from './cooldowns';
import { apply, getProfile, inTransaction } from './economy';
import { unlockLevel } from './progression';
import { weekNumber } from './quests';
import { addSeasonPoints } from './seasons';
import { isJailed } from './jail';

const DAY = 86_400_000;

/** Players active in a server in the last week (server XP is the cheap signal). */
export async function activePlayers(guildId: string, now = new Date()): Promise<number> {
  return MemberLevel.countDocuments({ guildId, updatedAt: { $gte: new Date(now.getTime() - 7 * DAY) } });
}

/** Creates this week's raid and community goal for a server, once (unique per server+week). */
export async function spawnWeekly(guildId: string, channelId: string, now = new Date()) {
  const week = weekNumber(now);
  const weekStart = new Date((week * 7 - 3) * DAY);
  const players = Math.max(raidRules.minPlayers, await activePlayers(guildId, now));
  const boss = bosses[week % bosses.length]!;
  const goalType = goalTypes[week % goalTypes.length]!;
  const created: string[] = [];
  const raidEnds = new Date(weekStart.getTime() + raidRules.hours * 3_600_000);
  // Set up mid-week, after this week's raid window: no raid until next Monday (the goal still runs)
  if (raidEnds > now) try {
    await Raid.create({ guildId, week, bossId: boss.id, maxHp: players * raidRules.hpPerPlayer, hp: players * raidRules.hpPerPlayer, endsAt: raidEnds, channelId });
    created.push('raid');
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  try {
    await CommunityGoal.create({ guildId, week, metric: goalType.metric, target: Math.max(goalRules.minPlayers, players) * goalType.perPlayer, endsAt: new Date(weekStart.getTime() + 7 * DAY), channelId });
    created.push('goal');
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return created;
}

export function raidDamage(level: number, hasWeapon: boolean, rng: Rng = defaultRng): number {
  const { base, perLevel, weaponMult } = raidRules.damage;
  return Math.round((base + perLevel * level) * (0.8 + rng.next() * 0.4) * (hasWeapon ? weaponMult : 1));
}

export type AttackResult = { damage: number; hp: number; maxHp: number; defeated: boolean };

/**
 * One attack. The cooldown is claimed first; the damage is one conditional update that only
 * matches a live boss. The attack that takes it to 0 flips the status and pays everyone, once.
 */
export async function attackRaid(guildId: string, userId: string, now = new Date(), rng: Rng = defaultRng): Promise<AttackResult> {
  const p = await getProfile(userId);
  if (isJailed(p.jailUntil, now.getTime())) throw new UserError("You're in jail.");
  const raid = await Raid.findOne({ guildId, status: 'active', endsAt: { $gt: now } }, null, { lean: true });
  if (!raid) throw new UserError('There is no boss to fight right now. A new one arrives every Monday.');
  const cd = await cooldowns.claim(userId, 'raid', raidRules.attackCooldownMinutes * 60_000);
  if (!cd.ok) throw new UserError(`You're catching your breath. Attack again in ${Math.ceil(cd.remainingMs / 60_000)}m.`);
  const damage = raidDamage(unlockLevel(p), !!p.tools?.weapon?.id, rng);
  const after = await Raid.findOneAndUpdate(
    { _id: raid._id, status: 'active', hp: { $gt: 0 } },
    { $inc: { hp: -damage, [`damage.${userId}`]: damage } },
    { new: true, lean: true },
  );
  if (!after) {
    await cooldowns.release(userId, 'raid');
    throw new UserError('The boss was just defeated. Too late!');
  }
  await addSeasonPoints(userId, raidRules.seasonPointsPerAttack, now);
  const defeated = after.hp <= 0 && (await finishRaid(String(after._id)));
  return { damage, hp: Math.max(0, after.hp), maxHp: after.maxHp, defeated };
}

export interface RaidPayout {
  userId: string;
  damage: number;
  coins: number;
  crate: string;
}

/** Shares out the rewards for a defeated raid. Pure: same input, same result. */
export function raidPayouts(damage: Record<string, number>): RaidPayout[] {
  const total = Object.values(damage).reduce((s, d) => s + d, 0);
  const ranked = Object.entries(damage).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const r = raidRules.reward;
  return ranked.map(([userId, d], i) => ({
    userId,
    damage: d,
    coins: Math.floor(r.base + (r.perShare * d) / total),
    crate: i === 0 ? r.mvp : i < 3 ? r.top3 : r.crate,
  }));
}

/** Flips a raid to defeated (once) and pays everyone who hit it, in one transaction. */
export async function finishRaid(raidId: string): Promise<boolean> {
  return inTransaction(async (session) => {
    const raid = await Raid.findOneAndUpdate({ _id: raidId, status: 'active' }, { $set: { status: 'defeated' } }, { session, new: true, lean: true });
    if (!raid) return false;
    const damage = Object.fromEntries(Object.entries((raid.damage ?? {}) as Record<string, number>));
    const exists = new Set((await User.find({ _id: { $in: Object.keys(damage) } }, { _id: 1 }, { lean: true, session })).map((u) => String(u._id)));
    for (const pay of raidPayouts(damage).filter((x) => exists.has(x.userId))) {
      await apply(pay.userId, { wallet: pay.coins, items: { [pay.crate]: 1 } }, { source: 'raid.reward', session, meta: { raidId } });
    }
    return true;
  });
}

/** Marks raids whose time ran out as escaped (no rewards). */
export async function expireRaids(now = new Date()): Promise<number> {
  const res = await Raid.updateMany({ status: 'active', endsAt: { $lte: now } }, { $set: { status: 'escaped' } });
  return res.modifiedCount;
}

/**
 * Completes community goals that reached their target (once) and pays contributors with enough
 * contributions; marks expired ones failed.
 */
export async function settleGoals(now = new Date()): Promise<number> {
  let done = 0;
  const reached = await CommunityGoal.find({ status: 'active', $expr: { $gte: ['$progress', '$target'] } }, { _id: 1 }, { lean: true });
  for (const g of reached) {
    const paid = await inTransaction(async (session) => {
      const goal = await CommunityGoal.findOneAndUpdate({ _id: g._id, status: 'active' }, { $set: { status: 'done' } }, { session, new: true, lean: true });
      if (!goal) return false;
      const contributors = Object.entries((goal.contributors ?? {}) as Record<string, number>).filter(([, n]) => n >= goalRules.minContribution).map(([id]) => id);
      const exists = new Set((await User.find({ _id: { $in: contributors } }, { _id: 1 }, { lean: true, session })).map((u) => String(u._id)));
      for (const id of contributors.filter((c) => exists.has(c))) {
        await apply(id, { wallet: goalRules.reward.coins, items: { [goalRules.reward.crate]: 1 } }, { source: 'goal.reward', session, meta: { goalId: String(goal._id) } });
      }
      return true;
    });
    if (paid) done++;
  }
  await CommunityGoal.updateMany({ status: 'active', endsAt: { $lte: now } }, { $set: { status: 'failed' } });
  return done;
}

export async function currentRaid(guildId: string, now = new Date()) {
  return Raid.findOne({ guildId, week: weekNumber(now) }, null, { lean: true });
}

export async function currentGoal(guildId: string, now = new Date()) {
  return CommunityGoal.findOne({ guildId, week: weekNumber(now) }, null, { lean: true });
}


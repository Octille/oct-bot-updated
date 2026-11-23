import { Types } from 'mongoose';
import { robRules } from '../content/social';
import { UserError } from '../lib/errors';
import { coins } from '../lib/format';
import { defaultRng, type Rng } from '../lib/rng';
import { RobEscrow } from '../models/RobEscrow';
import { User } from '../models/User';
import * as cooldowns from './cooldowns';
import { apply, getProfile, inTransaction, settle, type Profile } from './economy';
import { isJailed } from './jail';
import { unlockLevel } from './progression';

export type RobOutcome =
  | { kind: 'padlock'; fine: number }
  | { kind: 'failed'; fine: number; jailMinutes: number | null; chance: number }
  | { kind: 'success'; amount: number; escrowId: string; deadline: Date; chance: number };

export function hasGuardDog(p: Pick<Profile, 'boosts'>, now = Date.now()): boolean {
  const until = p.boosts?.guard;
  return !!until && new Date(until).getTime() > now;
}

export function robChance(robber: Profile, victim: Profile, now = Date.now()): number {
  const diff = unlockLevel(robber) - unlockLevel(victim);
  let chance = Math.min(robRules.maxChance, Math.max(robRules.minChance, robRules.baseChance + robRules.perLevel * diff));
  if (hasGuardDog(victim, now)) chance = Math.max(0.05, chance - robRules.guardDog);
  return chance;
}

export function robFine(robberWallet: number): number {
  return Math.min(robberWallet, Math.min(robRules.maxFine, Math.max(robRules.minFine, Math.floor(robberWallet * robRules.fineShare))));
}

/**
 * Tries to rob `victimId`. Checks everything, claims the victim's protection window (so two
 * robbers can't hit them at once), then settles the outcome atomically.
 */
export async function attemptRob(robberId: string, victimId: string, rng: Rng = defaultRng): Promise<RobOutcome> {
  if (robberId === victimId) throw new UserError("You can't rob yourself.");
  // Never create a profile for the target: robbing someone who never played would mint coins
  const victimDoc = await User.findById(victimId, null, { lean: true });
  if (!victimDoc) throw new UserError("They haven't played OctBot yet, so there's nothing to take.");
  const robber = await getProfile(robberId);
  const victim = victimDoc as unknown as Profile;
  const now = Date.now();

  if (unlockLevel(robber) < robRules.minLevel) throw new UserError(`Robbing unlocks at account level **${robRules.minLevel}**.`);
  if (robber.wallet < robRules.robberMinWallet) throw new UserError(`You need at least **${coins(robRules.robberMinWallet)}** in your wallet to rob (it covers the fine if you're caught).`);
  if (victim.wallet < robRules.targetMinWallet) throw new UserError(`They have less than **${coins(robRules.targetMinWallet)}** in their wallet. Not worth it.`);
  if (now - new Date(victim.lastActiveAt ?? 0).getTime() > robRules.targetActiveHours * 3_600_000) throw new UserError("They haven't been active in the last day. Pick someone who's around.");
  if (isJailed(victim.jailUntil, now)) throw new UserError("They're in jail. Even you have standards.");

  const protection = await cooldowns.claim(victimId, 'robbed', robRules.victimProtectionMinutes * 60_000);
  if (!protection.ok) throw new UserError(`They were robbed recently and are on guard. Try again in ${Math.ceil(protection.remainingMs / 60_000)}m.`);

  const fine = robFine(robber.wallet);

  // A padlock blocks it (and breaks); the robber pays the fine to the victim
  if ((((victim.inventory ?? {}) as Record<string, number>).padlock ?? 0) > 0) {
    try {
      await settle([
        { userId: victimId, change: { items: { padlock: -1 }, wallet: fine || undefined }, transfer: true },
        { userId: robberId, change: { wallet: fine ? -fine : undefined, inc: { 'stats.robsFailed': 1 } }, transfer: true },
      ], { source: 'rob.padlock', meta: { robberId, victimId } });
      return { kind: 'padlock', fine };
    } catch {
      // The padlock was used or sold a moment ago: carry on without it
    }
  }

  const chance = robChance(robber, victim, now);
  if (rng.next() >= chance) {
    const jail = rng.next() < robRules.jailChance;
    await settle([
      { userId: robberId, change: { wallet: fine ? -fine : undefined, inc: { 'stats.robsFailed': 1 }, ...(jail ? { set: { jailUntil: new Date(now + robRules.jailMinutes * 60_000) } } : {}) }, transfer: true },
      ...(fine ? [{ userId: victimId, change: { wallet: fine }, transfer: true }] : []),
    ], { source: 'rob.fail', meta: { robberId, victimId } });
    return { kind: 'failed', fine, jailMinutes: jail ? robRules.jailMinutes : null, chance };
  }

  const share = robRules.steal[0] + rng.next() * (robRules.steal[1] - robRules.steal[0]);
  const amount = Math.max(1, Math.min(robRules.maxSteal, Math.floor(victim.wallet * share)));
  const deadline = new Date(now + robRules.getawaySeconds * 1000);
  const escrowId = new Types.ObjectId();
  await inTransaction(async (session) => {
    await apply(victimId, { wallet: -amount, inc: { 'stats.robbedTimes': 1 } }, { source: 'rob.stolen', transfer: true, session, meta: { robberId, escrowId: String(escrowId) } });
    await RobEscrow.create([{ _id: escrowId, robberId, victimId, amount, deadline }], { session });
  });
  return { kind: 'success', amount, escrowId: String(escrowId), deadline, chance };
}

/** Pays held loot to the robber once the getaway window is over. Returns null if already resolved. */
export async function payEscrow(escrowId: string) {
  return inTransaction(async (session) => {
    const doc = await RobEscrow.findOneAndUpdate({ _id: escrowId, status: 'pending' }, { $set: { status: 'paid' } }, { session, new: true, lean: true });
    if (!doc) return null;
    await apply(doc.robberId, { wallet: doc.amount, inc: { 'stats.robsWon': 1 } }, { source: 'rob.getaway', transfer: true, session, meta: { victimId: doc.victimId } });
    return doc;
  });
}

/**
 * The victim caught the robber (clicked within the window, by Discord's timestamp): the loot goes
 * back, the robber pays a fine to the victim and goes to jail.
 */
export async function catchRobber(escrowId: string, victimId: string, clickedAt: Date) {
  return inTransaction(async (session) => {
    const doc = await RobEscrow.findOneAndUpdate(
      { _id: escrowId, status: 'pending', victimId, deadline: { $gte: clickedAt } },
      { $set: { status: 'caught' } },
      { session, new: true, lean: true },
    );
    if (!doc) return null;
    const robber = await getProfile(doc.robberId, session);
    const fine = robFine(robber.wallet);
    await apply(doc.robberId, {
      wallet: fine ? -fine : undefined,
      set: { jailUntil: new Date(Date.now() + robRules.caughtJailMinutes * 60_000) },
      inc: { 'stats.robsFailed': 1 },
    }, { source: 'rob.caught', transfer: true, session, meta: { victimId } });
    await apply(victimId, { wallet: doc.amount + fine, inc: { 'stats.robbersCaught': 1 } }, { source: 'rob.caught', transfer: true, session, meta: { robberId: doc.robberId } });
    return { ...doc, fine };
  });
}

/** Pays out every getaway whose window has passed (startup and every minute). */
export async function sweepEscrows(now = new Date()) {
  const due = await RobEscrow.find({ status: 'pending', deadline: { $lt: new Date(now.getTime() - 2_000) } }, null, { lean: true });
  const paid = [];
  for (const d of due) {
    const r = await payEscrow(String(d._id));
    if (r) paid.push(r);
  }
  return paid;
}

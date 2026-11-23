import { SnowflakeUtil } from 'discord.js';
import type { ClientSession } from 'mongoose';
import { antiAlt, dailyGiveLimit } from '../content/social';
import { dayNumber } from '../game/streaks';
import { UserError } from '../lib/errors';
import { coins } from '../lib/format';
import { User } from '../models/User';
import type { Profile } from './economy';
import { unlockLevel } from './progression';

const DAY = 86_400_000;

/** Discord account creation time, from the user id. */
export function accountCreated(userId: string): Date {
  // Non-snowflake ids only exist in tests; treat them as old accounts
  return /^\d{15,}$/.test(userId) ? new Date(Number(SnowflakeUtil.timestampFrom(userId))) : new Date(0);
}

/** Why this player can't send/receive or join, or null. `who` phrases the message. */
export function altBlocker(userId: string, profile: Pick<Profile, 'createdAt'> | null, who: 'You' | 'They', now = Date.now()): string | null {
  const accountDays = (now - accountCreated(userId).getTime()) / DAY;
  if (accountDays < antiAlt.minAccountDays) {
    return `${who === 'You' ? 'Your' : 'Their'} Discord account must be at least ${antiAlt.minAccountDays} days old (${who === 'You' ? "yours is" : "theirs is"} ${Math.floor(accountDays)}).`;
  }
  const created = profile?.createdAt ? new Date(profile.createdAt).getTime() : now;
  const profileDays = (now - created) / DAY;
  if (profileDays < antiAlt.minProfileDays) {
    const ready = Math.ceil((antiAlt.minProfileDays * DAY - (now - created)) / 3_600_000);
    return `${who} need to have played OctBot for ${antiAlt.minProfileDays} days first (${who === 'You' ? 'you' : 'they'} can in about ${ready}h).`;
  }
  return null;
}

export function assertNotAlt(userId: string, profile: Pick<Profile, 'createdAt'> | null, who: 'You' | 'They'): void {
  const why = altBlocker(userId, profile, who);
  if (why) throw new UserError(why);
}

export function coinLimit(profile: Profile): number {
  return Math.min(dailyGiveLimit.maxCoins, dailyGiveLimit.coinsPerLevel * unlockLevel(profile));
}

/** What's left of today's allowance. */
export function allowanceLeft(profile: Profile, now = new Date()): { coins: number; items: number } {
  const today = dayNumber(now);
  const g = profile.giving;
  const sameDay = g?.day === today;
  return {
    coins: Math.max(0, coinLimit(profile) - (sameDay ? g?.coins ?? 0 : 0)),
    items: Math.max(0, dailyGiveLimit.items - (sameDay ? g?.items ?? 0 : 0)),
  };
}

/**
 * Uses part of today's allowance, atomically (inside the caller's transaction, so it only counts
 * if the transfer goes through). Throws a clear message if it would go over.
 */
export async function useAllowance(profile: Profile, add: { coins?: number; items?: number }, session?: ClientSession, now = new Date()): Promise<void> {
  const c = add.coins ?? 0;
  const i = add.items ?? 0;
  if (!c && !i) return;
  const today = dayNumber(now);
  const cap = coinLimit(profile);
  const over = async () => {
    // Read today's total fresh: the profile we were given may be from before earlier gifts
    const current = await User.findById(profile._id, { giving: 1, account: 1 }, { lean: true, session });
    const left = allowanceLeft({ ...profile, giving: current?.giving ?? profile.giving } as Profile, now);
    const parts = [c > left.coins ? `${coins(left.coins)} more in coins` : null, i > left.items ? `${left.items} more items` : null].filter(Boolean);
    return new UserError(`Daily giving limit: you can send ${parts.join(' and ')} today (resets at 00:00 UTC). Your coin limit grows with your level.`);
  };
  if (c > cap || i > dailyGiveLimit.items) throw await over();
  // Same day: add, but only if it stays within the limits
  const same = await User.updateOne(
    { _id: profile._id, 'giving.day': today, $expr: { $and: [
      { $lte: [{ $add: [{ $ifNull: ['$giving.coins', 0] }, c] }, cap] },
      { $lte: [{ $add: [{ $ifNull: ['$giving.items', 0] }, i] }, dailyGiveLimit.items] },
    ] } },
    { $inc: { 'giving.coins': c, 'giving.items': i } },
    { session },
  );
  if (same.modifiedCount) return;
  // A new day: start the count fresh
  const fresh = await User.updateOne(
    { _id: profile._id, 'giving.day': { $ne: today } },
    { $set: { 'giving.day': today, 'giving.coins': c, 'giving.items': i } },
    { session },
  );
  if (!fresh.modifiedCount) throw await over();
}

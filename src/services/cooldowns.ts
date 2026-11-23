import type { ClientSession } from 'mongoose';
import { User } from '../models/User';
import { ensureUser } from './economy';

/**
 * Persistent cooldowns stored on the profile (`cooldowns.<key>` = expiry time).
 * Claiming is a single conditional update, so double-clicks and restarts can't double-claim.
 */

const KEY = /^[a-z0-9_-]+$/i;

export type ClaimResult = { ok: true; expiresAt: Date } | { ok: false; expiresAt: Date; remainingMs: number };

function pathFor(key: string): string {
  if (!KEY.test(key)) throw new Error(`Invalid cooldown key "${key}"`);
  return `cooldowns.${key}`;
}

/** Starts the cooldown if it isn't running. Returns when it will (or already does) expire. */
export async function claim(userId: string, key: string, durationMs: number, session?: ClientSession): Promise<ClaimResult> {
  const path = pathFor(key);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);

  await ensureUser(userId, session);
  const claimed = await User.findOneAndUpdate(
    { _id: userId, $or: [{ [path]: { $exists: false } }, { [path]: null }, { [path]: { $lte: now } }] },
    { $set: { [path]: expiresAt } },
    { new: true, session, projection: { _id: 1 } },
  );
  if (claimed) return { ok: true, expiresAt };

  const running = await expiry(userId, key, session);
  const until = running ?? expiresAt;
  return { ok: false, expiresAt: until, remainingMs: Math.max(0, until.getTime() - now.getTime()) };
}

/** When the cooldown expires, or null if it isn't running. */
export async function expiry(userId: string, key: string, session?: ClientSession): Promise<Date | null> {
  const user = await User.findById(userId, { [pathFor(key)]: 1 }, { session, lean: true });
  const value = user?.cooldowns?.[key];
  return value && value.getTime() > Date.now() ? value : null;
}

/** Cancels a cooldown, e.g. when the command failed after claiming it. */
export async function release(userId: string, key: string, session?: ClientSession): Promise<void> {
  await User.updateOne({ _id: userId }, { $unset: { [pathFor(key)]: '' } }, { session });
}

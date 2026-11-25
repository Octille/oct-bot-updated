import { dropRules } from '../content/events';
import { dayNumber } from '../game/streaks';
import { UserError } from '../lib/errors';
import { defaultRng, randInt, type Rng } from '../lib/rng';
import { Drop } from '../models/Events';
import { User } from '../models/User';
import { altBlocker } from './antiAlt';
import { apply, inTransaction, type Profile } from './economy';

/* Who has chatted in each channel recently, and when its last drop was (in memory). */
const chatters = new Map<string, Map<string, number>>();
const lastDrop = new Map<string, number>();

export function noteChatter(channelId: string, userId: string, now = Date.now()): number {
  const window = dropRules.chatWindowMinutes * 60_000;
  const seen = chatters.get(channelId) ?? new Map<string, number>();
  seen.set(userId, now);
  for (const [id, at] of seen) if (now - at > window) seen.delete(id);
  chatters.set(channelId, seen);
  if (chatters.size > 20_000) chatters.clear();
  return seen.size;
}

/** Whether this message spawns a drop: enough people chatting, the interval passed, then a roll. */
export function shouldDrop(channelId: string, distinctChatters: number, perHour: number, now = Date.now(), rng: Rng = defaultRng): boolean {
  if (distinctChatters < dropRules.minChatters) return false;
  const interval = 3_600_000 / Math.min(dropRules.maxPerHour, Math.max(1, perHour));
  if (now - (lastDrop.get(channelId) ?? 0) < interval) return false;
  if (rng.next() >= dropRules.chancePerMessage) return false;
  lastDrop.set(channelId, now);
  return true;
}

export async function createDrop(guildId: string, channelId: string, rng: Rng = defaultRng, now = new Date()) {
  const crate = rng.next() < dropRules.crateChance;
  return Drop.create({
    guildId, channelId,
    coins: crate ? 0 : randInt(dropRules.coins[0], dropRules.coins[1], rng),
    item: crate ? 'crate_common' : null,
    expiresAt: new Date(now.getTime() + dropRules.expireSeconds * 1000),
  });
}

/**
 * Grabs a drop: one transaction claims it (first click wins), counts it against the daily cap and
 * pays out. If anything fails (already grabbed, over the cap) nothing moves.
 */
export async function grabDrop(dropId: string, userId: string, now = new Date()) {
  const profile = (await User.findById(userId, null, { lean: true })) as unknown as Profile | null;
  if (!profile) throw new UserError('Play something first (try `/daily`), then you can grab drops.');
  const alt = altBlocker(userId, profile, 'You', now.getTime());
  if (alt) throw new UserError(alt);
  const today = dayNumber(now);
  return inTransaction(async (session) => {
    const drop = await Drop.findOneAndUpdate(
      { _id: dropId, status: 'open', expiresAt: { $gt: now } },
      { $set: { status: 'claimed', claimedBy: userId } },
      { session, new: true, lean: true },
    );
    if (!drop) throw new UserError('Too slow! Someone already grabbed it (or it expired).');
    // Daily cap: same-day increment under the cap, or the first grab of a new day
    const same = await User.updateOne({ _id: userId, 'drops.day': today, 'drops.count': { $lt: dropRules.dailyCap } }, { $inc: { 'drops.count': 1 } }, { session });
    if (!same.modifiedCount) {
      const fresh = await User.updateOne({ _id: userId, 'drops.day': { $ne: today } }, { $set: { 'drops.day': today, 'drops.count': 1 } }, { session });
      if (!fresh.modifiedCount) throw new UserError(`You've grabbed ${dropRules.dailyCap} drops today. Leave some for everyone else!`);
    }
    await apply(userId, { wallet: drop.coins || undefined, items: drop.item ? { [drop.item]: 1 } : undefined }, { source: 'drop', session, meta: { dropId } });
    return drop;
  });
}

export async function expireDrops(now = new Date()) {
  const due = await Drop.find({ status: 'open', expiresAt: { $lte: now } }, null, { lean: true });
  await Drop.updateMany({ _id: { $in: due.map((d) => d._id) }, status: 'open' }, { $set: { status: 'expired' } });
  return due;
}

import { veteranCosmetics, veteranInfo, type VeteranTier } from '../content/veteran';
import { creatorCosmetics } from '../content/cosmetics';
import { env } from '../config/env';
import { Transaction } from '../models/Transaction';
import { User } from '../models/User';
import { EconomyError } from '../lib/errors';
import { refreshBoard } from './boardStats';
import { apply, type Profile } from './economy';

/** Owner tools behind /eco. Every change goes through the economy service and is logged as `eco.*`. */

export async function ecoGive(userId: string, by: string, coins: number, item?: { id: string; qty: number }): Promise<Profile> {
  return apply(userId, { wallet: coins || undefined, items: item ? { [item.id]: item.qty } : undefined }, { source: 'eco.give', meta: { by } });
}

/** Takes coins from the wallet or bank, and/or items. Fails (changing nothing) if they don't have them. */
export async function ecoTake(userId: string, by: string, coins: number, from: 'wallet' | 'bank', item?: { id: string; qty: number }): Promise<Profile> {
  return apply(userId, {
    ...(coins ? { [from]: -coins } : {}),
    items: item ? { [item.id]: -item.qty } : undefined,
  }, { source: 'eco.take', meta: { by } });
}

/**
 * Resets a profile to a fresh one. Keeps the join date (anti-alt), the veteran tier and its
 * cosmetics (they can never be earned again), and the v2 flag, so the v2 profile isn't re-imported.
 * The coins removed are logged as `eco.reset`.
 */
export async function ecoReset(userId: string, by: string): Promise<{ wallet: number; bank: number }> {
  const before = await User.findById(userId, null, { lean: true });
  if (!before) throw new EconomyError('NO_PROFILE', 'They have no profile.');
  const tier = (before.veteran?.tier ?? null) as VeteranTier | null;
  const fresh = new User({ _id: userId }).toObject();
  const res = await User.replaceOne(
    { _id: userId, updatedAt: before.updatedAt }, // nothing changed since we read it
    {
      ...fresh,
      createdAt: before.createdAt,
      updatedAt: new Date(),
      migratedFromV2: before.migratedFromV2,
      veteran: { tier, welcomed: before.veteran?.welcomed ?? false },
      // The creator set stays with the creator, like the veteran set
      cosmetics: { ...fresh.cosmetics, owned: [...(tier ? veteranCosmetics(tier) : []), ...(userId === env.OWNER_ID ? creatorCosmetics : [])], badge: tier ? veteranInfo[tier].badge : null },
    },
    { timestamps: false }, // keep the original join date
  );
  if (!res.modifiedCount) throw new EconomyError('CONFLICT', 'Their profile changed while resetting. Try again.');
  const rows = [
    ...(before.wallet ? [{ kind: 'wallet', delta: -before.wallet }] : []),
    ...(before.bank ? [{ kind: 'bank', delta: -before.bank }] : []),
  ].map((r) => ({ ...r, userId, source: 'eco.reset', meta: { by } }));
  if (rows.length) await Transaction.insertMany(rows);
  await refreshBoard(userId);
  return { wallet: before.wallet, bank: before.bank };
}

export async function ecoLog(userId: string, limit = 15) {
  return Transaction.find({ userId }, null, { lean: true }).sort({ at: -1 }).limit(limit);
}

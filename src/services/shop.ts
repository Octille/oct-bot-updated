import { basics, rotationLimitPerPlayer, rotationPool, rotationSize, type ShopEntry } from '../content/shop';
import { getCosmetic } from '../content/cosmetics';
import { getItem, itemLabel } from '../content/items';
import { ShopRotation } from '../models/ShopRotation';
import { User } from '../models/User';
import { seededRng, shuffle } from '../lib/rng';
import { EconomyError, UserError } from '../lib/errors';
import { dayNumber } from '../game/streaks';
import { apply, inTransaction, type Profile } from './economy';

export interface RotationSlot extends ShopEntry {
  remaining: number;
}

/** Which items are in a day's rotation. Deterministic, so every shard/restart agrees. */
export function rotationFor(day: number): RotationSlot[] {
  return shuffle(rotationPool, seededRng(day * 7919)).slice(0, rotationSize)
    .map((e) => ({ id: e.id, kind: e.kind, price: e.price, remaining: e.stock }));
}

export async function getRotation(now = new Date()): Promise<{ day: number; stock: RotationSlot[] }> {
  const day = dayNumber(now);
  const doc = await ShopRotation.findOneAndUpdate(
    { _id: day },
    { $setOnInsert: { _id: day, stock: rotationFor(day) } },
    { upsert: true, new: true, lean: true },
  ).catch(async (err) => {
    if ((err as { code?: number }).code === 11000) return ShopRotation.findById(day).lean();
    throw err;
  });
  return { day, stock: (doc?.stock ?? []) as RotationSlot[] };
}

export function displayName(entry: Pick<ShopEntry, 'id' | 'kind'>): string {
  if (entry.kind === 'cosmetic') {
    const c = getCosmetic(entry.id);
    return c ? `${c.kind === 'title' ? '🏷️' : '🎨'} ${c.name} (${c.kind})` : entry.id;
  }
  return itemLabel(entry.id);
}

/** Basics, rotation and non-rotation cosmetics, by id. */
export async function findEntry(id: string): Promise<{ entry: ShopEntry; rotation: boolean; day: number } | null> {
  const { day, stock } = await getRotation();
  const rot = stock.find((s) => s.id === id);
  if (rot) return { entry: rot, rotation: true, day };
  const basic = basics.find((b) => b.id === id);
  if (basic) return { entry: basic, rotation: false, day };
  const cosmetic = getCosmetic(id);
  if (cosmetic && !cosmetic.rotationOnly) return { entry: { id, kind: 'cosmetic', price: cosmetic.price }, rotation: false, day };
  return null;
}

export interface Purchase {
  label: string;
  qty: number;
  total: number;
  profile: Profile;
}

export async function buy(userId: string, id: string, qty: number): Promise<Purchase> {
  const found = await findEntry(id);
  if (!found) throw new UserError("That isn't for sale right now. Check `/shop`.");
  const { entry, rotation, day } = found;
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100) throw new UserError('Buy between 1 and 100 at a time.');
  if ((entry.kind === 'cosmetic' || rotation) && qty !== 1) throw new UserError('You can only buy one of those.');

  const total = entry.price * qty;
  const label = displayName(entry);
  const change = entry.kind === 'cosmetic'
    ? { wallet: -total, addToSet: { 'cosmetics.owned': [id] }, where: { 'cosmetics.owned': { $ne: id } } }
    : { wallet: -total, items: { [id]: qty } };

  if (!rotation) {
    try {
      const profile = await apply(userId, change, { source: 'shop.buy', meta: { id, qty } });
      return { label, qty, total, profile };
    } catch (err) {
      if (err instanceof EconomyError && err.code === 'CONFLICT') throw new UserError('You already own that.');
      throw err;
    }
  }

  // Rotation items: take one from the shared stock and charge the player in one transaction
  const key = `${day}:${id}`;
  const profile = await inTransaction(async (session) => {
    const taken = await ShopRotation.updateOne(
      { _id: day, stock: { $elemMatch: { id, remaining: { $gte: qty } } } },
      { $inc: { 'stock.$.remaining': -qty } },
      { session },
    );
    if (taken.modifiedCount === 0) throw new UserError(`${label} is sold out today. The shop restocks at 00:00 UTC.`);
    try {
      return await apply(userId, {
        ...change,
        addToSet: { ...change.addToSet, rotationBought: [key] },
        where: { ...('where' in change ? change.where : {}), rotationBought: { $ne: key } },
      }, { source: 'shop.rotation', meta: { id, day }, session });
    } catch (err) {
      if (err instanceof EconomyError && err.code === 'CONFLICT') {
        throw new UserError(entry.kind === 'cosmetic' ? 'You already own that.' : `You can only buy ${rotationLimitPerPlayer} of each rotation item per day.`);
      }
      throw err;
    }
  });
  // Forget purchases from earlier days
  await User.updateOne({ _id: userId }, { $pull: { rotationBought: { $regex: `^(?!${day}:)` } } });
  return { label, qty, total, profile };
}

export function sellPriceOf(itemId: string): number {
  return getItem(itemId)?.sellPrice ?? 0;
}

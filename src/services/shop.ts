import { basics, rotationPool, rotationSize, type RotationEntry, type ShopEntry } from '../content/shop';
import { getCosmetic } from '../content/cosmetics';
import { getItem, itemLabel } from '../content/items';
import { seededRng, shuffle } from '../lib/rng';
import { EconomyError, UserError } from '../lib/errors';
import { dayNumber } from '../game/streaks';
import { apply, getProfile, type Change, type Profile } from './economy';

/** A day's rotation. Deterministic from the date, so every restart agrees and nothing is stored. */
export function rotationFor(day: number): RotationEntry[] {
  return shuffle(rotationPool, seededRng(day * 7919)).slice(0, rotationSize);
}

export function getRotation(now = new Date()): { day: number; stock: RotationEntry[] } {
  const day = dayNumber(now);
  return { day, stock: rotationFor(day) };
}

/** How many of a rotation item this player has bought today. */
export function boughtToday(profile: Pick<Profile, 'rotation'>, id: string, day: number): number {
  if (profile.rotation?.day !== day) return 0;
  return (profile.rotation.bought as Record<string, number> | undefined)?.[id] ?? 0;
}

export function displayName(entry: Pick<ShopEntry, 'id' | 'kind'>): string {
  if (entry.kind === 'cosmetic') {
    const c = getCosmetic(entry.id);
    return c ? `${c.kind === 'title' ? '🏷️' : '🎨'} ${c.name} (${c.kind})` : entry.id;
  }
  return itemLabel(entry.id);
}

/** Basics, today's rotation and non-rotation cosmetics, by id. */
export function findEntry(id: string): { entry: ShopEntry; rotation: RotationEntry | null; day: number } | null {
  const { day, stock } = getRotation();
  const rot = stock.find((s) => s.id === id);
  if (rot) return { entry: rot, rotation: rot, day };
  const basic = basics.find((b) => b.id === id);
  if (basic) return { entry: basic, rotation: null, day };
  const cosmetic = getCosmetic(id);
  if (cosmetic && !cosmetic.rotationOnly) return { entry: { id, kind: 'cosmetic', price: cosmetic.price }, rotation: null, day };
  return null;
}

export interface Purchase {
  label: string;
  qty: number;
  total: number;
  profile: Profile;
}

export async function buy(userId: string, id: string, qty: number): Promise<Purchase> {
  const found = findEntry(id);
  if (!found) throw new UserError("That isn't for sale right now. Check `/shop`.");
  const { entry, rotation, day } = found;
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100) throw new UserError('Buy between 1 and 100 at a time.');
  if (entry.kind === 'cosmetic' && qty !== 1) throw new UserError('You can only buy one of those.');

  const total = entry.price * qty;
  const label = displayName(entry);
  const base: Change = entry.kind === 'cosmetic'
    ? { wallet: -total, addToSet: { 'cosmetics.owned': [id] }, where: { 'cosmetics.owned': { $ne: id } } }
    : { wallet: -total, items: { [id]: qty } };

  const charge = async (change: Change) => {
    try {
      return await apply(userId, change, { source: rotation ? 'shop.rotation' : 'shop.buy', meta: { id, qty, day } });
    } catch (err) {
      if (err instanceof EconomyError && err.code === 'CONFLICT') return null;
      throw err;
    }
  };

  if (!rotation) {
    const profile = await charge(base);
    if (!profile) throw new UserError('You already own that.');
    return { label, qty, total, profile };
  }

  // Rotation items: count against today's per-player limit in the same update as the payment
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await getProfile(userId);
    const already = boughtToday(current, id, day);
    if (entry.kind === 'cosmetic' && (current.cosmetics?.owned ?? []).includes(id)) throw new UserError('You already own that.');
    if (already + qty > rotation.limit) {
      throw new UserError(`You can buy ${rotation.limit} ${label} per day (${already} bought today). The rotation resets at 00:00 UTC.`);
    }
    const path = `rotation.bought.${id}`;
    const profile = current.rotation?.day === day
      // Same day: only if the count hasn't moved past the limit in the meantime
      ? await charge({ ...base, inc: { [path]: qty }, where: { ...base.where, 'rotation.day': day, [path]: { $not: { $gt: rotation.limit - qty } } } })
      // First rotation purchase today: reset yesterday's counts
      : await charge({ ...base, set: { 'rotation.day': day, 'rotation.bought': { [id]: qty } }, where: { ...base.where, 'rotation.day': { $ne: day } } });
    if (profile) return { label, qty, total, profile };
  }
  throw new UserError('Your purchase changed while it was happening. Try again.');
}

export function sellPriceOf(itemId: string): number {
  return getItem(itemId)?.sellPrice ?? 0;
}

import { getItem, items } from '../content/items';
import { giveTax, transferMinLevel } from '../content/social';
import { UserError } from '../lib/errors';
import { User } from '../models/User';
import { settle, transfer, type Profile } from './economy';
import { inventoryOf } from './items';
import { unlockLevel } from './progression';

export interface Offer {
  coins: number;
  items: Record<string, number>;
}

export const emptyOffer = (): Offer => ({ coins: 0, items: {} });

/** The other player's profile, without ever creating one (no free starting coins for alts). */
export async function existingPlayer(userId: string): Promise<Profile> {
  const p = (await User.findById(userId, null, { lean: true })) as unknown as Profile | null;
  if (!p) throw new UserError("They haven't played OctBot yet.");
  return p;
}

export function assertCanTransfer(p: Profile, who: 'You' | 'They'): void {
  if (unlockLevel(p) < transferMinLevel) throw new UserError(`${who} need account level ${transferMinLevel} to send or trade coins and items.`);
}

/** Finds an item by id or name. */
export function findItem(query: string) {
  const q = query.trim().toLowerCase();
  return items.find((i) => i.id === q || i.name.toLowerCase() === q) ?? items.find((i) => i.name.toLowerCase().includes(q));
}

/** Checks an item can be offered: tradable, not locked, and owned (counting what's already offered). */
export function checkItemOffer(p: Profile, itemId: string, qty: number, alreadyOffered: number): void {
  const item = getItem(itemId);
  if (!item) throw new UserError("That item doesn't exist.");
  if (!item.tradable) throw new UserError(`${item.name} can't be traded.`);
  if ((p.lockedItems ?? []).includes(itemId)) throw new UserError(`${item.name} is locked. Unlock it in your inventory first.`);
  const owned = inventoryOf(p)[itemId] ?? 0;
  if (owned < alreadyOffered + qty) throw new UserError(`You only have ${owned}× ${item.name}.`);
}

export const coinsAfterTax = (amount: number) => amount - Math.floor(amount * giveTax);

/**
 * Swaps both offers in one transaction. Coins are taxed like /give. If either side no longer has
 * what they offered, nothing moves.
 */
export async function settleTrade(a: string, b: string, offers: Record<string, Offer>): Promise<void> {
  const oa = offers[a]!;
  const ob = offers[b]!;
  const merge = (give: Offer, get: Offer) => {
    const out: Record<string, number> = {};
    for (const [id, q] of Object.entries(give.items)) out[id] = (out[id] ?? 0) - q;
    for (const [id, q] of Object.entries(get.items)) out[id] = (out[id] ?? 0) + q;
    return Object.keys(out).length ? out : undefined;
  };
  const wallet = (give: Offer, get: Offer) => coinsAfterTax(get.coins) - give.coins || undefined;
  await settle([
    { userId: a, change: { wallet: wallet(oa, ob), items: merge(oa, ob), inc: { 'stats.trades': 1 } }, transfer: true },
    { userId: b, change: { wallet: wallet(ob, oa), items: merge(ob, oa), inc: { 'stats.trades': 1 } }, transfer: true },
  ], { source: 'trade', meta: { a, b } });
}

/** /give: coins to another player, taxed. */
export async function giveCoins(fromId: string, toId: string, amount: number) {
  if (fromId === toId) throw new UserError("You can't give coins to yourself.");
  const from = await existingPlayer(fromId);
  assertCanTransfer(from, 'You');
  await existingPlayer(toId);
  return transfer(fromId, toId, amount, { source: 'give', taxRate: giveTax });
}

/** /gift: items to another player (no tax). */
export async function giftItem(fromId: string, toId: string, itemId: string, qty: number) {
  if (fromId === toId) throw new UserError("You can't gift items to yourself.");
  const from = await existingPlayer(fromId);
  assertCanTransfer(from, 'You');
  await existingPlayer(toId);
  checkItemOffer(from, itemId, qty, 0);
  await settle([
    { userId: fromId, change: { items: { [itemId]: -qty } }, transfer: true },
    { userId: toId, change: { items: { [itemId]: qty } }, transfer: true },
  ], { source: 'gift', meta: { fromId, toId } });
}

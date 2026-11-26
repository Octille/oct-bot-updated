import { getItem, items } from '../content/items';
import { giveTax, transferMinLevel } from '../content/social';
import { UserError } from '../lib/errors';
import { User } from '../models/User';
import { apply, inTransaction, transfer, type Profile } from './economy';
import { assertNotAlt, useAllowance } from './antiAlt';
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

/** Level, account age and profile age checks for anyone sending or receiving. */
export function assertCanTransfer(p: Profile, who: 'You' | 'They'): void {
  assertNotAlt(p._id, p, who);
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
  const itemCount = (o: Offer) => Object.values(o.items).reduce((s, q) => s + q, 0);
  const [pa, pb] = await Promise.all([existingPlayer(a), existingPlayer(b)]);
  await inTransaction(async (session) => {
    // Re-check what's offered against the profiles as they are now: an item may have been locked
    // (or stopped being tradable) after it went into the offer. Counts are enforced by apply.
    for (const [id, offer] of [[a, oa], [b, ob]] as const) {
      const now = (await User.findById(id, { lockedItems: 1 }, { session, lean: true })) as Pick<Profile, 'lockedItems'> | null;
      for (const itemId of Object.keys(offer.items)) {
        const item = getItem(itemId);
        if (!item?.tradable) throw new UserError(`${item?.name ?? itemId} can't be traded.`);
        if ((now?.lockedItems ?? []).includes(itemId)) throw new UserError(`${item.name} is locked now, so the trade was cancelled.`);
      }
    }
    // What each side gives away counts toward their daily giving limit
    await useAllowance(pa, { coins: oa.coins, items: itemCount(oa) }, session);
    await useAllowance(pb, { coins: ob.coins, items: itemCount(ob) }, session);
    await apply(a, { wallet: wallet(oa, ob), items: merge(oa, ob), inc: { 'stats.trades': 1 } }, { source: 'trade', transfer: true, session, meta: { a, b } });
    await apply(b, { wallet: wallet(ob, oa), items: merge(ob, oa), inc: { 'stats.trades': 1 } }, { source: 'trade', transfer: true, session, meta: { a, b } });
  });
}

/** /give: coins to another player, taxed. */
export async function giveCoins(fromId: string, toId: string, amount: number) {
  if (fromId === toId) throw new UserError("You can't give coins to yourself.");
  const from = await existingPlayer(fromId);
  assertCanTransfer(from, 'You');
  assertNotAlt(toId, await existingPlayer(toId), 'They');
  return transfer(fromId, toId, amount, { source: 'give', taxRate: giveTax, inside: (session) => useAllowance(from, { coins: amount }, session) });
}

/** /gift: items to another player (no tax). */
export async function giftItem(fromId: string, toId: string, itemId: string, qty: number) {
  if (fromId === toId) throw new UserError("You can't gift items to yourself.");
  const from = await existingPlayer(fromId);
  assertCanTransfer(from, 'You');
  assertNotAlt(toId, await existingPlayer(toId), 'They');
  checkItemOffer(from, itemId, qty, 0);
  await inTransaction(async (session) => {
    await useAllowance(from, { items: qty }, session);
    await apply(fromId, { items: { [itemId]: -qty } }, { source: 'gift', transfer: true, session, meta: { fromId, toId } });
    await apply(toId, { items: { [itemId]: qty } }, { source: 'gift', transfer: true, session, meta: { fromId, toId } });
  });
}

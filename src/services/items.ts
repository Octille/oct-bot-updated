import { guardDogDays, maxGuardDogDays } from '../content/social';
import { boosts, consumableUses } from '../content/consumables';
import { economyConfig } from '../content/economy';
import { getCrate } from '../content/crates';
import { getItem, items, itemLabel, type ItemType } from '../content/items';
import { rarities, type Rarity } from '../content/rarity';
import { EconomyError, UserError } from '../lib/errors';
import { coins } from '../lib/format';
import { extendBoost } from '../game/boosts';
import { openCrate, scratch, type CrateLoot } from '../game/crates';
import { apply, getProfile, type Profile } from './economy';
import { User } from '../models/User';

export type Inventory = Record<string, number>;

export function inventoryOf(profile: Pick<Profile, 'inventory'>): Inventory {
  return (profile.inventory ?? {}) as Inventory;
}

/** What everything in the inventory would sell for. */
export function inventoryValue(inventory: Inventory): number {
  return Object.entries(inventory).reduce((s, [id, qty]) => s + (getItem(id)?.sellPrice ?? 0) * qty, 0);
}

export type UseResult =
  | { kind: 'boost'; label: string; until: Date }
  | { kind: 'guard_dog'; until: Date }
  | { kind: 'bank_note'; qty: number; newCapacityBonus: number }
  | { kind: 'scratch'; qty: number; prizes: number[]; total: number }
  | { kind: 'crate'; itemId: string; qty: number; loot: CrateLoot };

export async function useItem(userId: string, itemId: string, qty: number): Promise<UseResult> {
  const item = getItem(itemId);
  const use = consumableUses[itemId];
  if (!item || !use) throw new UserError(`${item ? itemLabel(itemId) : 'That'} can't be used.`);
  if (!Number.isSafeInteger(qty) || qty < 1) throw new UserError('Use at least one.');
  const profile = await getProfile(userId);
  const owned = inventoryOf(profile)[itemId] ?? 0;
  if (owned < qty) throw new UserError(`You only have ${owned}× ${itemLabel(itemId)}.`);

  switch (use.kind) {
    case 'streak_freeze':
      throw new UserError('Streak freezes are used automatically when you miss a day of `/daily`. Just keep it in your inventory.');
    case 'passive':
      throw new UserError(`${itemLabel(itemId)} works by itself while it's in your inventory.`);
    case 'guard_dog': {
      // Each dog adds days of protection, up to a cap
      const current = profile.boosts?.guard ?? null;
      const now = Date.now();
      const start = current && new Date(current).getTime() > now ? new Date(current).getTime() : now;
      const until = new Date(Math.min(start + qty * guardDogDays * 86_400_000, now + maxGuardDogDays * 86_400_000));
      if (until.getTime() <= start) throw new UserError(`Your guard dog is already on duty for the maximum ${maxGuardDogDays} days.`);
      try {
        await apply(userId, { items: { [itemId]: -qty }, set: { 'boosts.guard': until }, where: { 'boosts.guard': current } }, { source: 'item.use', meta: { itemId, qty } });
      } catch (err) {
        if (err instanceof EconomyError && err.code === 'CONFLICT') throw new UserError('Your guard dog changed while you were using it. Try again.');
        throw err;
      }
      return { kind: 'guard_dog', until };
    }
    case 'boost': {
      if (qty > 4) throw new UserError('You can use up to 4 boosts at a time.');
      const info = boosts[use.boost];
      const current = profile.boosts?.[use.boost] ?? null;
      let until = current ? new Date(current) : null;
      for (let i = 0; i < qty; i++) until = extendBoost(until, info.minutes);
      try {
        await apply(userId, {
          items: { [itemId]: -qty },
          set: { [`boosts.${use.boost}`]: until },
          where: { [`boosts.${use.boost}`]: current },
        }, { source: 'item.use', meta: { itemId, qty } });
      } catch (err) {
        if (err instanceof EconomyError && err.code === 'CONFLICT') throw new UserError('That boost changed while you were using it. Try again.');
        throw err;
      }
      return { kind: 'boost', label: `${info.emoji} ${info.label}`, until: until! };
    }
    case 'bank_note': {
      const updated = await apply(userId, { items: { [itemId]: -qty }, inc: { bankNotes: qty } }, { source: 'item.use', meta: { itemId, qty } });
      return { kind: 'bank_note', qty, newCapacityBonus: (updated.bankNotes ?? 0) * economyConfig.bank.perNote };
    }
    case 'scratch': {
      if (qty > 25) throw new UserError('You can scratch up to 25 cards at a time.');
      const prizes = Array.from({ length: qty }, () => scratch());
      const total = prizes.reduce((a, b) => a + b, 0);
      await apply(userId, { items: { [itemId]: -qty }, wallet: total || undefined }, { source: 'scratch', meta: { qty } });
      return { kind: 'scratch', qty, prizes, total };
    }
    case 'crate': {
      if (qty > 10) throw new UserError('You can open up to 10 crates at a time.');
      const crate = getCrate(itemId)!;
      const loot: CrateLoot = { coins: 0, items: {} };
      for (let i = 0; i < qty; i++) {
        const one = openCrate(crate);
        loot.coins += one.coins;
        for (const [id, n] of Object.entries(one.items)) loot.items[id] = (loot.items[id] ?? 0) + n;
      }
      // Removing the crates and adding the loot happens in one update
      const itemsChange: Record<string, number> = { ...loot.items };
      itemsChange[itemId] = (itemsChange[itemId] ?? 0) - qty;
      await apply(userId, { wallet: loot.coins || undefined, items: itemsChange, inc: { 'stats.cratesOpened': qty } }, { source: 'crate', meta: { itemId, qty } });
      return { kind: 'crate', itemId, qty, loot };
    }
  }
}

/** Types /sell bulk can include. Consumables and crates are only sold one item at a time. */
export const bulkTypes: ItemType[] = ['fish', 'material', 'collectible'];

export type BulkFilter = { type: ItemType } | { rarity: Rarity } | { everything: true };

/** Epic and rarer items are left out of bulk sales unless the player opts in. */
export const RARE_FROM: Rarity = 'epic';

export function isRareItem(id: string): boolean {
  const item = getItem(id);
  return !!item && rarities.indexOf(item.rarity) >= rarities.indexOf(RARE_FROM);
}

export interface BulkOptions {
  includeRare?: boolean;
  locked?: readonly string[];
}

export interface BulkSelection {
  items: Inventory;
  /** Stacks left out because they're Epic+ and includeRare is off. */
  skippedRare: Inventory;
  /** Stacks left out because the player locked them. */
  skippedLocked: Inventory;
}

/** What a bulk sale would sell. Locked items are never included. */
export function selectForSale(inventory: Inventory, filter: BulkFilter, opts: BulkOptions = {}): BulkSelection {
  const out: BulkSelection = { items: {}, skippedRare: {}, skippedLocked: {} };
  const locked = new Set(opts.locked ?? []);
  for (const [id, qty] of Object.entries(inventory)) {
    const item = getItem(id);
    if (!item || qty <= 0 || !bulkTypes.includes(item.type)) continue;
    if ('type' in filter && item.type !== filter.type) continue;
    if ('rarity' in filter && item.rarity !== filter.rarity) continue;
    if (locked.has(id)) out.skippedLocked[id] = qty;
    else if (!opts.includeRare && isRareItem(id)) out.skippedRare[id] = qty;
    else out.items[id] = qty;
  }
  return out;
}

export function saleTotal(items: Inventory): number {
  return Object.entries(items).reduce((s, [id, q]) => s + (getItem(id)?.sellPrice ?? 0) * q, 0);
}

/** Lock or unlock an item so bulk sales skip it. */
export async function setLocked(userId: string, itemId: string, locked: boolean): Promise<void> {
  if (!getItem(itemId)) throw new UserError("I don't know that item.");
  await User.updateOne({ _id: userId }, locked ? { $addToSet: { lockedItems: itemId } } : { $pull: { lockedItems: itemId } });
}

export interface Sale {
  items: Inventory;
  total: number;
  profile: Profile;
}

/** Sells exactly these quantities, all or nothing. */
export async function sell(userId: string, toSell: Inventory): Promise<Sale> {
  const entries = Object.entries(toSell).filter(([, q]) => q > 0);
  if (!entries.length) throw new UserError('Nothing to sell.');
  let total = 0;
  let count = 0;
  let fish = 0;
  for (const [id, qty] of entries) {
    const item = getItem(id);
    if (!item || item.sellPrice <= 0) throw new UserError(`${itemLabel(id)} can't be sold.`);
    total += item.sellPrice * qty;
    count += qty;
    if (item.type === 'fish') fish += qty;
  }
  const profile = await apply(userId, {
    wallet: total,
    items: Object.fromEntries(entries.map(([id, q]) => [id, -q])),
    // fishSold drives "sell fish" quests: fish only come from fishing, so they can't be bought to resell
    inc: { 'stats.itemsSold': count, ...(fish ? { 'stats.fishSold': fish } : {}) },
  }, { source: 'sell', meta: { count } });
  return { items: Object.fromEntries(entries), total, profile };
}

export function describeSale(sale: Pick<Sale, 'items' | 'total'>, limit = 12): string {
  const lines = Object.entries(sale.items).slice(0, limit).map(([id, q]) => `${itemLabel(id, q)} → ${coins((getItem(id)?.sellPrice ?? 0) * q)}`);
  const more = Object.keys(sale.items).length - limit;
  if (more > 0) lines.push(`…and ${more} more`);
  return lines.join('\n');
}

export function itemChoices(query: string, filter?: (id: string) => boolean): { name: string; value: string }[] {
  const q = query.toLowerCase();
  return items
    .filter((i) => (!filter || filter(i.id)) && (i.name.toLowerCase().includes(q) || i.id.includes(q)))
    .slice(0, 25)
    .map((i) => ({ name: `${i.name} (${i.rarity})`, value: i.id }));
}

export { rarities };

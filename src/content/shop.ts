/** Always-available stock, plus a pool the daily rotation (00:00 UTC) draws from. */

export interface ShopEntry {
  id: string;
  price: number;
  kind: 'item' | 'cosmetic';
}

export const basics: readonly ShopEntry[] = [
  { id: 'scratch_card', price: 1_000, kind: 'item' },
  { id: 'crate_common', price: 5_000, kind: 'item' },
  { id: 'xp_boost', price: 8_000, kind: 'item' },
  { id: 'luck_potion', price: 12_000, kind: 'item' },
  { id: 'streak_freeze', price: 15_000, kind: 'item' },
  { id: 'bank_note', price: 18_000, kind: 'item' },
  { id: 'coin_boost', price: 20_000, kind: 'item' },
];

export interface RotationEntry extends ShopEntry {
  /** Total stock for everyone that day. */
  stock: number;
}

export const rotationPool: readonly RotationEntry[] = [
  { id: 'crate_rare', price: 22_500, kind: 'item', stock: 25 },
  { id: 'crate_epic', price: 90_000, kind: 'item', stock: 6 },
  { id: 'crate_legendary', price: 400_000, kind: 'item', stock: 2 },
  { id: 'golden_ticket', price: 3_500, kind: 'item', stock: 15 },
  { id: 'gem_octite', price: 20_000, kind: 'item', stock: 3 },
  { id: 'title_lucky', price: 75_000, kind: 'cosmetic', stock: 10 },
  { id: 'title_collector', price: 120_000, kind: 'cosmetic', stock: 6 },
  { id: 'theme_gold', price: 150_000, kind: 'cosmetic', stock: 5 },
  { id: 'theme_aurora', price: 90_000, kind: 'cosmetic', stock: 8 },
];

export const rotationSize = 4;
/** Each player can buy at most this many of each rotation item per day. */
export const rotationLimitPerPlayer = 1;

/** Shops buy back consumables and crates at this fraction of their shop price. */
export const buybackRate = 0.4;

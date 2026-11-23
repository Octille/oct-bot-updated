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
  { id: 'padlock', price: 4_000, kind: 'item' },
  { id: 'guard_dog', price: 25_000, kind: 'item' },
];

export interface RotationEntry extends ShopEntry {
  /** How many each player can buy per day while it's in the rotation. */
  limit: number;
}

export const rotationPool: readonly RotationEntry[] = [
  { id: 'crate_rare', price: 22_500, kind: 'item', limit: 3 },
  { id: 'crate_epic', price: 90_000, kind: 'item', limit: 2 },
  { id: 'crate_legendary', price: 400_000, kind: 'item', limit: 1 },
  { id: 'golden_ticket', price: 3_500, kind: 'item', limit: 5 },
  { id: 'gem_octite', price: 20_000, kind: 'item', limit: 2 },
  { id: 'title_lucky', price: 75_000, kind: 'cosmetic', limit: 1 },
  { id: 'title_collector', price: 120_000, kind: 'cosmetic', limit: 1 },
  { id: 'theme_gold', price: 150_000, kind: 'cosmetic', limit: 1 },
  { id: 'theme_aurora', price: 90_000, kind: 'cosmetic', limit: 1 },
];

export const rotationSize = 4;

/** Shops buy back consumables and crates at this fraction of their shop price. */
export const buybackRate = 0.4;

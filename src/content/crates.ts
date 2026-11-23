import type { Rarity } from './rarity';

/** Crate loot. Each crate rolls its table `rolls` times. Shop crates are worth ~90% of their price on average. */

export type LootEntry =
  | { weight: number; coins: [number, number] }
  | { weight: number; item: string; qty: [number, number] };

export interface Crate {
  itemId: string;
  rarity: Rarity;
  rolls: number;
  loot: LootEntry[];
}

export const crates: readonly Crate[] = [
  {
    itemId: 'crate_common', rarity: 'common', rolls: 2,
    loot: [
      { weight: 55, coins: [1_500, 3_500] },
      { weight: 12, item: 'scratch_card', qty: [1, 2] },
      { weight: 10, item: 'xp_boost', qty: [1, 1] },
      { weight: 8, item: 'luck_potion', qty: [1, 1] },
      { weight: 10, item: 'rubber_duck', qty: [1, 3] },
      { weight: 5, item: 'gem_emerald', qty: [1, 1] },
    ],
  },
  {
    itemId: 'crate_rare', rarity: 'rare', rolls: 3,
    loot: [
      { weight: 50, coins: [3_000, 9_000] },
      { weight: 12, item: 'coin_boost', qty: [1, 1] },
      { weight: 12, item: 'luck_potion', qty: [1, 2] },
      { weight: 8, item: 'streak_freeze', qty: [1, 1] },
      { weight: 8, item: 'bank_note', qty: [1, 1] },
      { weight: 7, item: 'gem_sapphire', qty: [1, 2] },
      { weight: 3, item: 'crate_epic', qty: [1, 1] },
    ],
  },
  {
    itemId: 'crate_epic', rarity: 'epic', rolls: 4,
    loot: [
      { weight: 45, coins: [16_000, 40_000] },
      { weight: 15, item: 'coin_boost', qty: [1, 2] },
      { weight: 12, item: 'bank_note', qty: [1, 2] },
      { weight: 10, item: 'streak_freeze', qty: [1, 2] },
      { weight: 10, item: 'gem_ruby', qty: [1, 2] },
      { weight: 6, item: 'golden_ticket', qty: [1, 2] },
      { weight: 2, item: 'crate_legendary', qty: [1, 1] },
    ],
  },
  {
    itemId: 'crate_legendary', rarity: 'legendary', rolls: 5,
    loot: [
      { weight: 45, coins: [90_000, 190_000] },
      { weight: 15, item: 'bank_note', qty: [2, 4] },
      { weight: 12, item: 'coin_boost', qty: [2, 3] },
      { weight: 12, item: 'gem_octite', qty: [1, 2] },
      { weight: 10, item: 'streak_freeze', qty: [2, 3] },
      { weight: 6, item: 'dig_chest', qty: [1, 1] },
    ],
  },
];

export function getCrate(itemId: string): Crate | undefined {
  return crates.find((c) => c.itemId === itemId);
}

/** Crates granted at account levels (every 5th level) and daily streak milestones. */
export function levelCrate(level: number): string | null {
  if (level % 25 === 0) return 'crate_legendary';
  if (level % 10 === 0) return 'crate_epic';
  if (level % 5 === 0) return 'crate_rare';
  return null;
}

export const streakCrates: Record<number, string> = {
  3: 'crate_common', 7: 'crate_rare', 14: 'crate_rare', 30: 'crate_epic', 60: 'crate_legendary', 100: 'crate_legendary',
};

import type { Rarity } from './rarity';

/** /dig — a 3×3 plot with one buried treasure. Each dig says whether you're getting warm. */

export const gridSize = 3;

export interface Treasure {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
}

export const treasures: readonly Treasure[] = [
  { id: 'dig_bottle', name: 'Old Bottle', emoji: '🍾', rarity: 'common' },
  { id: 'dig_arrowhead', name: 'Arrowhead', emoji: '🗿', rarity: 'uncommon' },
  { id: 'dig_fossil', name: 'Fossil', emoji: '🦴', rarity: 'rare' },
  { id: 'dig_vase', name: 'Ancient Vase', emoji: '🏺', rarity: 'epic' },
  { id: 'dig_chest', name: 'Pirate Chest', emoji: '🧰', rarity: 'legendary' },
  { id: 'dig_crown', name: 'Crown of Oct', emoji: '👑', rarity: 'mythic' },
];

export const treasureRarityWeights: Record<Rarity, number> = {
  common: 50, uncommon: 28, rare: 14, epic: 6, legendary: 1.8, mythic: 0.2,
};
export const digLuckPerPoint = 0.35;

/** Treasure sell price; the shovel's value multiplier is paid on top as an appraisal bonus. */
export const treasureValue: Record<Rarity, number> = {
  common: 60, uncommon: 160, rare: 460, epic: 1_400, legendary: 5_000, mythic: 21_000,
};

/** What an ordinary (non-treasure) square holds. */
export const squareOdds = {
  coins: 0.45,
  junk: 0.15,
  // the rest is plain dirt
  coinRange: [18, 50] as const,
  junk_items: ['dig_worm', 'dig_cap'] as const,
};

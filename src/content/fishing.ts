import type { Rarity } from './rarity';

/** /fish — cast, wait for the bite, hit REEL in time. */

export interface FishSpecies {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  /** Size range in kg; bigger catches are worth more. */
  kg: [number, number];
}

export const fishSpecies: readonly FishSpecies[] = [
  { id: 'fish_sardine', name: 'Sardine', emoji: '🐟', rarity: 'common', kg: [0.1, 0.3] },
  { id: 'fish_perch', name: 'Perch', emoji: '🐟', rarity: 'common', kg: [0.2, 1.2] },
  { id: 'fish_carp', name: 'Carp', emoji: '🐟', rarity: 'common', kg: [1, 6] },
  { id: 'fish_mackerel', name: 'Mackerel', emoji: '🐟', rarity: 'common', kg: [0.3, 1.5] },
  { id: 'fish_bass', name: 'Bass', emoji: '🐠', rarity: 'uncommon', kg: [1, 5] },
  { id: 'fish_trout', name: 'Rainbow Trout', emoji: '🐠', rarity: 'uncommon', kg: [0.5, 4] },
  { id: 'fish_catfish', name: 'Catfish', emoji: '🐠', rarity: 'uncommon', kg: [2, 20] },
  { id: 'fish_salmon', name: 'Salmon', emoji: '🐠', rarity: 'rare', kg: [3, 15] },
  { id: 'fish_puffer', name: 'Pufferfish', emoji: '🐡', rarity: 'rare', kg: [0.5, 3] },
  { id: 'fish_tuna', name: 'Bluefin Tuna', emoji: '🐟', rarity: 'rare', kg: [60, 250] },
  { id: 'fish_swordfish', name: 'Swordfish', emoji: '🗡️', rarity: 'epic', kg: [50, 200] },
  { id: 'fish_octopus', name: 'Octopus', emoji: '🐙', rarity: 'epic', kg: [3, 15] },
  { id: 'fish_shark', name: 'Great White', emoji: '🦈', rarity: 'epic', kg: [500, 1100] },
  { id: 'fish_koi', name: 'Golden Koi', emoji: '🎏', rarity: 'legendary', kg: [2, 12] },
  { id: 'fish_coelacanth', name: 'Coelacanth', emoji: '🦕', rarity: 'legendary', kg: [40, 90] },
  { id: 'fish_kraken', name: 'Oct, the Kraken', emoji: '🦑', rarity: 'mythic', kg: [900, 2500] },
];

/** Base rarity weights (Old Rod). Rod luck moves weight away from common. */
export const fishRarityWeights: Record<Rarity, number> = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 0.9, mythic: 0.1,
};

/** Each point of rod luck multiplies every non-common weight by this much. */
export const luckPerPoint = 0.25;

/** Average sell value per rarity; a fish's actual value scales with its size (0.75×–1.5×). */
export const fishValue: Record<Rarity, number> = {
  common: 50, uncommon: 150, rare: 400, epic: 1_200, legendary: 4_000, mythic: 15_000,
};

/** Milliseconds you get to hit REEL, by rarity (before the rod's bonus). */
export const reelWindowMs: Record<Rarity, number> = {
  common: 2_500, uncommon: 2_000, rare: 1_600, epic: 1_300, legendary: 1_100, mythic: 950,
};

export const castWait = {
  /** Wait before the bite, in ms. */
  minMs: 1_000,
  maxMs: 4_000,
  /** Chance of a fake "nibble…" before the real bite (pressing then scares the fish). */
  fakeNibbleChance: 0.3,
} as const;

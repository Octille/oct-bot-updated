import type { Rarity } from './rarity';

/** /hunt — something bursts from one of three bushes; click that bush in time. */

export interface Animal {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
}

export const animals: readonly Animal[] = [
  { id: 'hunt_rabbit', name: 'Rabbit', emoji: '🐇', rarity: 'common' },
  { id: 'hunt_squirrel', name: 'Squirrel', emoji: '🐿️', rarity: 'common' },
  { id: 'hunt_pheasant', name: 'Pheasant', emoji: '🐦', rarity: 'common' },
  { id: 'hunt_duck', name: 'Mallard', emoji: '🦆', rarity: 'uncommon' },
  { id: 'hunt_fox', name: 'Red Fox', emoji: '🦊', rarity: 'uncommon' },
  { id: 'hunt_turkey', name: 'Wild Turkey', emoji: '🦃', rarity: 'uncommon' },
  { id: 'hunt_deer', name: 'Deer', emoji: '🦌', rarity: 'rare' },
  { id: 'hunt_boar', name: 'Wild Boar', emoji: '🐗', rarity: 'rare' },
  { id: 'hunt_wolf', name: 'Grey Wolf', emoji: '🐺', rarity: 'epic' },
  { id: 'hunt_bear', name: 'Grizzly', emoji: '🐻', rarity: 'epic' },
  { id: 'hunt_moose', name: 'Moose', emoji: '🫎', rarity: 'legendary' },
  { id: 'hunt_stag', name: 'White Stag', emoji: '🤍', rarity: 'legendary' },
  { id: 'hunt_phoenix', name: 'Phoenix', emoji: '🐦‍🔥', rarity: 'mythic' },
];

/** Base rarity weights (Slingshot). Weapon luck moves weight away from common. */
export const animalRarityWeights: Record<Rarity, number> = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 0.9, mythic: 0.1,
};
export const huntLuckPerPoint = 0.5;

/** Trophy sell price; anything a better weapon adds on top is paid instantly. */
export const animalValue: Record<Rarity, number> = {
  common: 60, uncommon: 180, rare: 600, epic: 1_800, legendary: 7_000, mythic: 30_000,
};

/** Time to click the right bush, by rarity (before the weapon's bonus). Never below 1.2s. */
export const huntWindowMs: Record<Rarity, number> = {
  common: 2_000, uncommon: 1_800, rare: 1_600, epic: 1_400, legendary: 1_300, mythic: 1_200,
};

/** Wait before something appears, in ms. */
export const huntDelay = { minMs: 800, maxMs: 2_500 } as const;

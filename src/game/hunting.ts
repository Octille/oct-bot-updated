import { animalRarityWeights, animals, animalValue, huntDelay, huntLuckPerPoint, huntWindowMs, type Animal } from '../content/hunting';
import { rarities, type Rarity } from '../content/rarity';
import { defaultRng, pick, randInt, weighted, type Rng } from '../lib/rng';
import { boostedWeights, weightedAverage } from './loot';

export interface Hunt {
  animal: Animal;
  /** Which of the three bushes it appears in. */
  bush: number;
  delayMs: number;
  /** Full trophy value; above the sell price is paid instantly. */
  value: number;
}

export function planHunt(luck: number, valueMult: number, rng: Rng = defaultRng): Hunt {
  const weights = boostedWeights(animalRarityWeights, luck, huntLuckPerPoint);
  const rarity = weighted(rarities, (r) => weights[r], rng);
  const animal = pick(animals.filter((a) => a.rarity === rarity), rng);
  return {
    animal,
    bush: randInt(0, 2, rng),
    delayMs: randInt(huntDelay.minMs, huntDelay.maxMs, rng),
    value: Math.round(animalValue[rarity] * valueMult),
  };
}

export function huntWindow(rarity: Rarity, bonusMs: number): number {
  return huntWindowMs[rarity] + bonusMs;
}

export function trophyBonus(h: Hunt): number {
  return Math.max(0, h.value - animalValue[h.animal.rarity]);
}

export function expectedHuntValue(luck: number, valueMult: number): number {
  return weightedAverage(boostedWeights(animalRarityWeights, luck, huntLuckPerPoint), animalValue) * valueMult;
}

import { castWait, fishRarityWeights, fishSpecies, fishValue, luckPerPoint, reelWindowMs, type FishSpecies } from '../content/fishing';
import { rarities, type Rarity } from '../content/rarity';
import { chance, defaultRng, pick, randInt, weighted, type Rng } from '../lib/rng';

export function rarityWeights(luck: number): Record<Rarity, number> {
  const boost = 1 + luck * luckPerPoint;
  const weights = { ...fishRarityWeights };
  for (const r of rarities) if (r !== 'common') weights[r] *= boost;
  return weights;
}

export interface Catch {
  species: FishSpecies;
  kg: number;
  value: number;
}

/** What's on the line. Bigger fish within a species are rarer and worth more. */
export function rollCatch(luck: number, rng: Rng = defaultRng): Catch {
  const weights = rarityWeights(luck);
  const rarity = weighted(rarities, (r) => weights[r], rng);
  const species = pick(fishSpecies.filter((f) => f.rarity === rarity), rng);
  const sizeRoll = rng.next() ** 1.6;
  const [min, max] = species.kg;
  const kg = Math.round((min + (max - min) * sizeRoll) * 100) / 100;
  const value = Math.round(fishValue[rarity] * (0.75 + 0.75 * sizeRoll));
  return { species, kg, value };
}

export function reelWindow(rarity: Rarity, rodBonusMs: number): number {
  return reelWindowMs[rarity] + rodBonusMs;
}

export interface CastPlan {
  /** When the real bite happens, ms after casting. */
  biteAtMs: number;
  /** A fake nibble shown before the bite, if any. */
  nibbleAtMs: number | null;
}

export function planCast(rng: Rng = defaultRng): CastPlan {
  const biteAtMs = randInt(castWait.minMs, castWait.maxMs, rng);
  const nibbleAtMs = chance(castWait.fakeNibbleChance, rng) && biteAtMs > 1_600 ? randInt(500, biteAtMs - 900, rng) : null;
  return { biteAtMs, nibbleAtMs };
}

/** Average value of what's on the line per cast (before reaction success). For BALANCE.md. */
export function expectedCatchValue(luck: number): number {
  const weights = rarityWeights(luck);
  const total = rarities.reduce((s, r) => s + weights[r], 0);
  // average size factor of 0.75 + 0.75 * E[u^1.6] where E[u^1.6] = 1/2.6
  const sizeFactor = 0.75 + 0.75 / 2.6;
  return rarities.reduce((s, r) => s + (weights[r] / total) * fishValue[r] * sizeFactor, 0);
}

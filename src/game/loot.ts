import { rarities, type Rarity } from '../content/rarity';

/** Luck multiplies every non-common rarity weight by (1 + luck × perPoint). */
export function boostedWeights(base: Record<Rarity, number>, luck: number, perPoint: number): Record<Rarity, number> {
  const boost = 1 + Math.max(0, luck) * perPoint;
  const weights = { ...base };
  for (const r of rarities) if (r !== 'common') weights[r] *= boost;
  return weights;
}

/** Average of value-by-rarity under the given weights. */
export function weightedAverage(weights: Record<Rarity, number>, values: Record<Rarity, number>): number {
  const total = rarities.reduce((s, r) => s + weights[r], 0);
  return rarities.reduce((s, r) => s + (weights[r] / total) * values[r], 0);
}

import { crashRules } from '../../content/gambling';
import type { Rng } from '../../lib/rng';

/** Crash point, drawn before the round starts. P(point ≥ x) = 0.97 / x. */
export function crashPoint(rng: Rng): number {
  const u = rng.next();
  const raw = crashRules.houseReturn / (1 - u);
  return Math.min(crashRules.maxMultiplier, Math.max(1, Math.floor(raw * 100) / 100));
}

/** The multiplier `ms` milliseconds into the round. */
export function crashMultiplierAt(ms: number): number {
  return Math.floor(2 ** (ms / 1000 / crashRules.doubleEverySeconds) * 100) / 100;
}

/** Milliseconds until the multiplier reaches `m`. */
export function crashTimeFor(m: number): number {
  return Math.log2(m) * crashRules.doubleEverySeconds * 1000;
}

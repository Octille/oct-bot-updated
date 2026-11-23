/** A random source. Game logic takes one of these so tests can use a seeded generator. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
}

export const defaultRng: Rng = { next: Math.random };

/** Deterministic generator (mulberry32) for tests and replayable rolls. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}

/** Integer in [min, max] inclusive. */
export function randInt(min: number, max: number, rng: Rng = defaultRng): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function chance(probability: number, rng: Rng = defaultRng): boolean {
  return rng.next() < probability;
}

export function pick<T>(items: readonly T[], rng: Rng = defaultRng): T {
  if (items.length === 0) throw new Error('pick() from an empty list');
  return items[Math.floor(rng.next() * items.length)]!;
}

/** Weighted pick; weights don't need to sum to 1. */
export function weighted<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng = defaultRng): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) throw new Error('weighted() needs at least one positive weight');
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll < 0) return item;
  }
  return items[items.length - 1]!;
}

export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

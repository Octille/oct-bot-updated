import { describe, expect, it } from 'vitest';
import { chance, pick, randInt, seededRng, shuffle, weighted } from '../src/lib/rng';

describe('rng', () => {
  it('seeded generators are deterministic', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const rollsA = Array.from({ length: 20 }, () => a.next());
    const rollsB = Array.from({ length: 20 }, () => b.next());
    expect(rollsA).toEqual(rollsB);
    expect(rollsA.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('randInt stays inside the inclusive range and hits both ends', () => {
    const rng = seededRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = randInt(3, 6, rng);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('weighted picks follow the weights', () => {
    const rng = seededRng(7);
    const items = [{ id: 'common', w: 90 }, { id: 'rare', w: 10 }, { id: 'never', w: 0 }];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const { id } = weighted(items, (x) => x.w, rng);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts.never).toBeUndefined();
    expect(counts.rare! / 10_000).toBeGreaterThan(0.08);
    expect(counts.rare! / 10_000).toBeLessThan(0.12);
  });

  it('chance, pick and shuffle behave', () => {
    const rng = seededRng(3);
    expect(chance(0, rng)).toBe(false);
    expect(chance(1, rng)).toBe(true);
    expect(['a', 'b']).toContain(pick(['a', 'b'], rng));
    expect(() => pick([], rng)).toThrow();
    const shuffled = shuffle([1, 2, 3, 4, 5], rng);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

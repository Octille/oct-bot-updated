import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/lib/rng';
import { huntWindow, planHunt, expectedHuntValue, trophyBonus } from '../src/game/hunting';
import { huntWindowMs } from '../src/content/hunting';
import { findChance, makePlot, warmth } from '../src/game/digging';
import { commitCrime } from '../src/game/crime';
import { crimes } from '../src/content/crime';
import { expectedCrateValue, expectedScratchValue, openCrate } from '../src/game/crates';
import { crates, levelCrate } from '../src/content/crates';
import { basics, rotationPool } from '../src/content/shop';
import { getItem, items } from '../src/content/items';
import { consumableUses, maxBoostMinutes } from '../src/content/consumables';
import { extendBoost, isActive } from '../src/game/boosts';
import { claimDaily } from '../src/game/streaks';
import { rarities } from '../src/content/rarity';
import { cosmetics } from '../src/content/cosmetics';
import { rotationFor } from '../src/services/shop';
import { shovels } from '../src/content/tools';

describe('hunting', () => {
  it('appears in one of three bushes after a short delay', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 1000; i++) {
      const h = planHunt(2, 1.5, rng);
      expect([0, 1, 2]).toContain(h.bush);
      expect(h.delayMs).toBeGreaterThanOrEqual(800);
      expect(h.delayMs).toBeLessThanOrEqual(2500);
      expect(trophyBonus(h)).toBeGreaterThanOrEqual(0);
    }
  });

  it('every window is at least 1.2s and better weapons are worth more', () => {
    for (const r of rarities) expect(huntWindowMs[r]).toBeGreaterThanOrEqual(1200);
    expect(huntWindow('rare', 250)).toBe(huntWindowMs.rare + 250);
    expect(expectedHuntValue(4, 4.5)).toBeGreaterThan(expectedHuntValue(0, 1));
  });
});

describe('digging', () => {
  it('every plot has exactly one treasure', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 500; i++) {
      const plot = makePlot(1, 1, rng);
      expect(plot.squares.filter((s) => s.kind === 'treasure')).toHaveLength(1);
      expect(plot.squares[plot.treasureAt]!.kind).toBe('treasure');
    }
  });

  it('hot = next to it, warm = same row or column, cold = anywhere else', () => {
    expect(warmth(0, 4)).toBe('hot'); // corner next to centre
    expect(warmth(3, 7)).toBe('hot'); // diagonal
    expect(warmth(0, 2)).toBe('warm'); // same row, two away
    expect(warmth(1, 7)).toBe('warm'); // same column, two away
    expect(warmth(0, 8)).toBe('cold'); // opposite corners
    expect(warmth(0, 5)).toBe('cold');
  });

  it('every shovel digs at most 3 squares', () => {
    for (const s of shovels) expect(s.digs).toBeLessThanOrEqual(3);
  });

  /** Success rate for a player who starts at `start` and then only digs squares consistent with every hint. */
  function simulate(digs: number, start: number, trials = 40_000): number {
    const rng = seededRng(3 + start);
    let found = 0;
    for (let t = 0; t < trials; t++) {
      const treasureAt = Math.floor(rng.next() * 9);
      let candidates = [...Array(9).keys()];
      let guess = start;
      for (let d = 0; d < digs; d++) {
        if (guess === treasureAt) { found++; break; }
        const hint = warmth(guess, treasureAt);
        const dug = guess;
        candidates = candidates.filter((c) => c !== dug && warmth(dug, c) === hint);
        guess = candidates[Math.floor(rng.next() * candidates.length)]!;
      }
    }
    return found / trials;
  }

  it('3 digs: a hint-following player finds the treasure 75–85% of the time', () => {
    const corner = simulate(3, 0);
    const edge = simulate(3, 1);
    expect(corner).toBeGreaterThanOrEqual(0.75);
    expect(edge).toBeLessThanOrEqual(0.87);
    // The balance model's assumption sits inside that range
    expect(findChance[3]!).toBeGreaterThanOrEqual(corner - 0.02);
    expect(findChance[3]!).toBeLessThanOrEqual(edge);
    expect(findChance[2]!).toBeLessThanOrEqual(simulate(2, 0) + 0.02);
  });

  it('starting in the centre is a trap (its hint is always hot)', () => {
    expect(simulate(3, 4)).toBeLessThan(simulate(3, 0) - 0.1);
  });
});

describe('crime', () => {
  it('successful crimes sometimes drop crime-only loot; riskier crimes drop more often', () => {
    const rng = seededRng(12);
    const drops = crimes.map((c) => {
      let n = 0;
      for (let i = 0; i < 20_000; i++) {
        const r = commitCrime({ ...c, success: 1 }, 1_000, 1, rng);
        if (r.success && r.loot) {
          expect(r.loot).toMatch(/^crime_/);
          expect(getItem(r.loot)).toBeDefined();
          n++;
        }
      }
      return n / 20_000;
    });
    expect(drops[0]!).toBeLessThan(drops[1]!);
    expect(drops[1]!).toBeLessThan(drops[2]!);
    expect(drops[2]!).toBeCloseTo(crimes[2]!.dropChance, 1);
  });

  it('fines never exceed what you carry', () => {
    const rng = seededRng(4);
    for (let i = 0; i < 2000; i++) {
      const r = commitCrime(crimes[2]!, 500, 1, rng);
      if (!r.success) expect(r.fine).toBeLessThanOrEqual(500);
      else expect(r.coins).toBeGreaterThanOrEqual(crimes[2]!.payout[0]);
    }
  });
});

describe('crates and scratch cards', () => {
  it('only drops items that exist', () => {
    for (const crate of crates) {
      for (const entry of crate.loot) if ('item' in entry) expect(getItem(entry.item), entry.item).toBeDefined();
      const loot = openCrate(crate, seededRng(5));
      expect(loot.coins + Object.values(loot.items).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    }
  });

  it('shop crates are worth 80–100% of their price on average (a gentle coin sink)', () => {
    const prices: Record<string, number> = { crate_common: basics.find((b) => b.id === 'crate_common')!.price };
    // Rotation crates have a per-player daily limit instead of shared stock
    for (const r of rotationPool) if (r.id.startsWith('crate_')) prices[r.id] = r.price;
    for (const [id, price] of Object.entries(prices)) {
      const ev = expectedCrateValue(crates.find((c) => c.itemId === id)!);
      expect(ev / price, id).toBeGreaterThanOrEqual(0.8);
      expect(ev / price, id).toBeLessThanOrEqual(1);
    }
  });

  it('scratch cards keep about a 15% house edge', () => {
    expect(expectedScratchValue()).toBeGreaterThan(840);
    expect(expectedScratchValue()).toBeLessThan(860);
  });

  it('level crates every 5 levels, bigger at 10 and 25', () => {
    expect(levelCrate(4)).toBeNull();
    expect(levelCrate(5)).toBe('crate_rare');
    expect(levelCrate(10)).toBe('crate_epic');
    expect(levelCrate(25)).toBe('crate_legendary');
  });
});

describe('boosts and streak freezes', () => {
  it('stacks onto remaining time and caps at the maximum', () => {
    const now = 1_000_000;
    const once = extendBoost(null, 30, now);
    expect(once.getTime()).toBe(now + 30 * 60_000);
    let t: Date | null = null;
    for (let i = 0; i < 10; i++) t = extendBoost(t, 30, now);
    expect(t!.getTime()).toBe(now + maxBoostMinutes * 60_000);
    expect(isActive({ xp: new Date(now + 1) }, 'xp', now)).toBe(true);
    expect(isActive({ xp: new Date(now - 1) }, 'xp', now)).toBe(false);
  });

  it('a streak freeze saves one missed day; not enough freezes still resets', () => {
    const day = (n: number) => new Date(n * 86_400_000 + 43_200_000);
    const state = { count: 10, best: 10, lastDaily: day(100), days: [] };
    expect(claimDaily(state, day(102), 1, 1)).toMatchObject({ ok: true, streak: 11, freezesUsed: 1 });
    expect(claimDaily(state, day(103), 1, 1)).toMatchObject({ ok: true, streak: 1, freezesUsed: 0 });
    expect(claimDaily(state, day(103), 1, 2)).toMatchObject({ ok: true, streak: 11, freezesUsed: 2 });
    expect(claimDaily(state, day(101), 1, 3)).toMatchObject({ ok: true, streak: 11, freezesUsed: 0 });
  });
});

describe('content integrity', () => {
  it('item ids are unique and valid', () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it('every usable item and shop item exists', () => {
    for (const id of Object.keys(consumableUses)) expect(getItem(id), id).toBeDefined();
    for (const b of basics) expect(getItem(b.id), b.id).toBeDefined();
    for (const r of rotationPool) {
      if (r.kind === 'item') expect(getItem(r.id), r.id).toBeDefined();
      else expect(cosmetics.find((c) => c.id === r.id), r.id).toBeDefined();
    }
  });

  it('every rotation item has a per-player limit; the Legendary Crate is 1 per day', () => {
    for (const r of rotationPool) expect(r.limit, r.id).toBeGreaterThanOrEqual(1);
    expect(rotationPool.find((r) => r.id === 'crate_legendary')!.limit).toBe(1);
  });

  it('the rotation is deterministic per day and changes between days', () => {
    expect(rotationFor(500)).toEqual(rotationFor(500));
    const days = new Set(Array.from({ length: 10 }, (_, d) => rotationFor(600 + d).map((s) => s.id).join()));
    expect(days.size).toBeGreaterThan(1);
  });
});

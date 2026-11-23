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

  it('warm means the treasure is in a neighbouring square', () => {
    expect(warmth(0, 4)).toBe('hot'); // corner next to centre
    expect(warmth(0, 8)).toBe('cold'); // opposite corners
    expect(warmth(1, 7)).toBe('cold');
    expect(warmth(3, 7)).toBe('hot'); // diagonal
  });

  it('a player following the hints finds treasure about as often as BALANCE.md assumes', () => {
    const rng = seededRng(3);
    const neighbours = (i: number) => [...Array(9).keys()].filter((j) => j !== i && warmth(i, j) === 'hot');
    for (const digs of [2, 3, 4]) {
      let found = 0;
      const trials = 20_000;
      for (let t = 0; t < trials; t++) {
        const treasureAt = Math.floor(rng.next() * 9);
        // Strategy: start in a corner; if warm, try its neighbours; if cold, try the rest
        let candidates = [...Array(9).keys()];
        let guess = 0;
        for (let d = 0; d < digs; d++) {
          if (guess === treasureAt) { found++; break; }
          const hot = warmth(guess, treasureAt) === 'hot';
          const near = new Set(neighbours(guess));
          candidates = candidates.filter((c) => c !== guess && (hot ? near.has(c) : !near.has(c)));
          guess = candidates[Math.floor(rng.next() * candidates.length)]!;
        }
      }
      // The model should not be more generous than a sensible strategy
      expect(found / trials, `${digs} digs`).toBeGreaterThanOrEqual(findChance[digs]! - 0.02);
    }
  });
});

describe('crime', () => {
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

  it('the rotation is deterministic per day and changes between days', () => {
    expect(rotationFor(500)).toEqual(rotationFor(500));
    const days = new Set(Array.from({ length: 10 }, (_, d) => rotationFor(600 + d).map((s) => s.id).join()));
    expect(days.size).toBeGreaterThan(1);
  });
});

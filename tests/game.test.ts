import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/lib/rng';
import { jobs, getJob, rankFor } from '../src/content/jobs';
import { colourClick, isPerfect, memory, performanceFor, quickMath, randomMinigame, unscramble } from '../src/game/minigames';
import { shiftPay } from '../src/game/jobs';
import { expectedMineCoins, resolveMine, rollTunnels } from '../src/game/mining';
import { tunnels } from '../src/content/mining';
import { expectedCatchValue, freshCatchBonus, newFishdexRewards, planCast, rarityWeights, reelWindow, rollCatch } from '../src/game/fishing';
import { fishSpecies, fishValue, reelWindowMs } from '../src/content/fishing';
import { rarities } from '../src/content/rarity';
import { hourly, hoursToLevel, scenarios } from '../src/game/balance';
import { claimDaily, claimWeekly, dayNumber, streakCalendar } from '../src/game/streaks';
import { rollBeg, rollSearch } from '../src/game/begSearch';
import { levelFromXp, totalXpForLevel, xpToNext } from '../src/content/levels';
import { repairCost, pickaxes, rods, weapons, shovels, repairCostFraction } from '../src/content/tools';
import { performance } from '../src/content/jobs';

describe('minigames', () => {
  it('every game has a valid solution for every job, over many seeds', () => {
    for (const job of jobs) {
      for (let seed = 0; seed < 200; seed++) {
        for (const make of [unscramble, quickMath, memory, colourClick]) {
          const game = make(job, seededRng(seed));
          expect(game.buttons.length).toBeGreaterThanOrEqual(3);
          expect(game.buttons.length).toBeLessThanOrEqual(5);
          expect(game.solution.length).toBeGreaterThan(0);
          for (const index of game.solution) expect(game.buttons[index]).toBeDefined();
          expect(new Set(game.solution).size).toBe(game.solution.length);
          expect(game.timeLimitMs).toBeLessThanOrEqual(10_000);
          if (game.preview) expect(game.preview.ms + game.timeLimitMs).toBeLessThanOrEqual(12_000);
        }
      }
    }
  });

  it('unscramble options are unique and only one is the real word', () => {
    for (let seed = 0; seed < 300; seed++) {
      const job = getJob('chef');
      const game = unscramble(job, seededRng(seed));
      const labels = game.buttons.map((b) => b.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.filter((l) => job.words.includes(l))).toHaveLength(1);
      expect(job.words).toContain(labels[game.solution[0]!]);
    }
  });

  it('quick maths answers are correct and options are unique', () => {
    for (const job of jobs) {
      for (let seed = 0; seed < 200; seed++) {
        const game = quickMath(job, seededRng(seed));
        const expr = /\*\*(.+)\*\*/.exec(game.prompt)![1]!.replace('×', '*').replace('−', '-');
        // eslint-disable-next-line no-new-func
        const answer = Function(`return ${expr}`)() as number;
        expect(Number(game.buttons[game.solution[0]!]!.label)).toBe(answer);
        expect(new Set(game.buttons.map((b) => b.label)).size).toBe(4);
      }
    }
  });

  it('memory sequences get longer with job difficulty', () => {
    expect(memory(getJob('barista'), seededRng(1)).solution).toHaveLength(3);
    expect(memory(getJob('ceo'), seededRng(1)).solution).toHaveLength(5);
  });

  it('never repeats the previous game kind', () => {
    const rng = seededRng(9);
    let last = randomMinigame(jobs[0]!, rng).kind;
    for (let i = 0; i < 200; i++) {
      const next = randomMinigame(jobs[0]!, rng, last).kind;
      expect(next).not.toBe(last);
      last = next;
    }
  });

  it('pays more for faster answers and a little for failing', () => {
    expect(performanceFor(false, 1000, 9000)).toBe(performance.fail);
    expect(performanceFor(true, 0, 9000)).toBeCloseTo(performance.fastest);
    expect(performanceFor(true, 9000, 9000)).toBeCloseTo(performance.slowest);
    expect(performanceFor(true, 2000, 9000)).toBeGreaterThan(performanceFor(true, 6000, 9000));
    expect(isPerfect(true, 2000, 9000)).toBe(true);
    expect(isPerfect(true, 5000, 9000)).toBe(false);
    expect(isPerfect(false, 100, 9000)).toBe(false);
  });
});

describe('jobs', () => {
  it('promotes by shifts and pays by rank', () => {
    expect(rankFor(0).title).toBe('Trainee');
    expect(rankFor(10).title).toBe('Junior');
    expect(rankFor(149).title).toBe('Lead');
    expect(rankFor(150).title).toBe('Legend');
    const barista = getJob('barista');
    expect(shiftPay(barista, 0, 1, 1, false)).toBe(barista.basePay);
    expect(shiftPay(barista, 150, 1, 1, false)).toBe(Math.round(barista.basePay * 1.6));
    expect(shiftPay(barista, 0, 1, 1, true)).toBe(Math.round(barista.basePay * 1.1));
  });

  it('job ladder unlocks in increasing level order with increasing pay', () => {
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i]!.level).toBeGreaterThan(jobs[i - 1]!.level);
      expect(jobs[i]!.basePay).toBeGreaterThan(jobs[i - 1]!.basePay);
    }
  });
});

describe('mining', () => {
  it('offers three different tunnels', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = rollTunnels(seededRng(seed)).map((t) => t.id);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('average haul matches the expected-value formula used in BALANCE.md', () => {
    const rng = seededRng(5);
    let total = 0;
    const n = 40_000;
    for (let i = 0; i < n; i++) total += resolveMine(tunnels[i % tunnels.length]!, 1, 1, rng).coins;
    expect(total / n).toBeGreaterThan(expectedMineCoins(1) * 0.95);
    expect(total / n).toBeLessThan(expectedMineCoins(1) * 1.05);
  });

  it('cave-ins cost extra durability and never give gems', () => {
    const rng = seededRng(11);
    for (let i = 0; i < 2000; i++) {
      const r = resolveMine(tunnels.find((t) => t.id === 'deep')!, 4, 1, rng);
      if (r.caveIn) {
        expect(r.durabilityUsed).toBeGreaterThan(1);
        expect(r.gemId).toBeNull();
      } else expect(r.durabilityUsed).toBe(1);
    }
  });
});

describe('fishing', () => {
  it('rod luck shifts catches away from common', () => {
    const w0 = rarityWeights(0);
    const w4 = rarityWeights(4);
    expect(w4.common).toBe(w0.common);
    expect(w4.legendary).toBeGreaterThan(w0.legendary);
    expect(expectedCatchValue(4)).toBeGreaterThan(expectedCatchValue(0));
  });

  it('catches stay inside each species size range', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 5000; i++) {
      const c = rollCatch(2, 1, rng);
      expect(c.kg).toBeGreaterThanOrEqual(c.species.kg[0]);
      expect(c.kg).toBeLessThanOrEqual(c.species.kg[1]);
      expect(c.value).toBeGreaterThan(0);
    }
  });

  it('every reel window is at least 1.2s before the rod bonus', () => {
    for (const r of rarities) expect(reelWindowMs[r]).toBeGreaterThanOrEqual(1_200);
  });

  it('better rods make each catch worth more; the bonus is the value above the base price', () => {
    expect(expectedCatchValue(0, 4.5)).toBeCloseTo(expectedCatchValue(0, 1) * 4.5);
    const rng = seededRng(8);
    for (let i = 0; i < 500; i++) {
      const c = rollCatch(4, 4.5, rng);
      expect(freshCatchBonus(c)).toBe(Math.max(0, c.value - fishValue[c.species.rarity]));
    }
  });

  it('fishdex rewards unlock at 25/50/75/100% and only once', () => {
    const quarter = Math.ceil(fishSpecies.length / 4);
    expect(newFishdexRewards(quarter - 1, [])).toEqual([]);
    expect(newFishdexRewards(quarter, []).map((r) => r.percent)).toEqual([25]);
    expect(newFishdexRewards(quarter, [25])).toEqual([]);
    expect(newFishdexRewards(fishSpecies.length, [25]).map((r) => r.percent)).toEqual([50, 75, 100]);
  });

  it('rarer fish give less time to reel, rods give more', () => {
    expect(reelWindow('common', 0)).toBeGreaterThan(reelWindow('legendary', 0));
    expect(reelWindow('rare', 300)).toBe(reelWindow('rare', 0) + 300);
  });

  it('casts bite within the configured wait and fake nibbles come first', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 1000; i++) {
      const p = planCast(rng);
      expect(p.biteAtMs).toBeGreaterThanOrEqual(1000);
      expect(p.biteAtMs).toBeLessThanOrEqual(4000);
      if (p.nibbleAtMs !== null) expect(p.nibbleAtMs).toBeLessThan(p.biteAtMs - 500);
    }
  });
});

describe('streaks', () => {
  const day = (n: number) => new Date(n * 86_400_000 + 12 * 3_600_000); // noon UTC on day n
  const fresh = { count: 0, best: 0, lastDaily: null, days: [] };

  it('first claim starts a streak; same-day claims are refused', () => {
    const first = claimDaily(fresh, day(100), 1);
    expect(first).toMatchObject({ ok: true, streak: 1 });
    const again = claimDaily({ count: 1, best: 1, lastDaily: day(100), days: [100] }, new Date(day(100).getTime() + 3_600_000), 1);
    expect(again.ok).toBe(false);
  });

  it('consecutive UTC days grow the streak; missing a full reset day resets it', () => {
    const next = claimDaily({ count: 6, best: 6, lastDaily: day(100), days: [] }, day(101), 1);
    expect(next).toMatchObject({ ok: true, streak: 7, multiplier: 1.5, milestoneBonus: 10_000, coins: 11_250 });
    // Claimed at 00:01 on day 100, then 23:59 on day 101: nearly 48h apart but no reset day missed
    const lateNextDay = claimDaily({ count: 6, best: 6, lastDaily: new Date(100 * 86_400_000 + 60_000), days: [] }, new Date(102 * 86_400_000 - 60_000), 1);
    expect(lateNextDay).toMatchObject({ ok: true, streak: 7 });
    const gap = claimDaily({ count: 6, best: 6, lastDaily: day(100), days: [] }, day(102), 1);
    expect(gap).toMatchObject({ ok: true, streak: 1, broken: true, best: 6 });
  });

  it('just after midnight UTC counts as the next day', () => {
    const late = new Date(100 * 86_400_000 + 86_399_000); // 23:59:59 day 100
    const early = new Date(101 * 86_400_000 + 1_000); // 00:00:01 day 101
    expect(dayNumber(late)).toBe(100);
    expect(claimDaily({ count: 1, best: 1, lastDaily: late, days: [100] }, early, 1)).toMatchObject({ ok: true, streak: 2 });
  });

  it('weekly needs 7 days and grows up to 2x', () => {
    const now = day(200);
    expect(claimWeekly({ weeklyCount: 3, lastWeekly: day(195) }, now, 1).ok).toBe(false);
    expect(claimWeekly({ weeklyCount: 3, lastWeekly: day(193) }, now, 1)).toMatchObject({ ok: true, streak: 4, multiplier: 1.3 });
    expect(claimWeekly({ weeklyCount: 30, lastWeekly: day(193) }, now, 1)).toMatchObject({ multiplier: 2 });
    expect(claimWeekly({ weeklyCount: 3, lastWeekly: day(180) }, now, 1)).toMatchObject({ streak: 1 });
  });

  it('draws a two-week calendar', () => {
    const cal = streakCalendar([99, 100], day(100));
    expect(cal.split('\n')).toHaveLength(3);
    expect(cal).toContain('🟩');
  });
});

describe('balance targets', () => {
  it('no single loop is more than 35% of income at any stage', () => {
    for (const s of scenarios) {
      const h = hourly(s);
      for (const loop of ['work', 'mine', 'fish', 'beg', 'search', 'hunt', 'dig', 'crime'] as const) {
        expect(h[loop] / h.gross, `${s.name}: ${loop}`).toBeLessThanOrEqual(0.355);
      }
    }
  });

  it('tool wear is 10–15% of income once you own real tools', () => {
    for (const s of scenarios.slice(1)) {
      const share = hourly(s).wear / hourly(s).gross;
      expect(share, s.name).toBeGreaterThanOrEqual(0.095);
      expect(share, s.name).toBeLessThanOrEqual(0.15);
    }
  });

  it('level 35 takes 60–80 active hours; first unlocks come quickly', () => {
    expect(hoursToLevel(35)).toBeGreaterThanOrEqual(60);
    expect(hoursToLevel(35)).toBeLessThanOrEqual(80);
    expect(hoursToLevel(5)).toBeLessThan(2);
  });

  it('income grows at every stage', () => {
    const gross = scenarios.map((s) => hourly(s).gross);
    for (let i = 1; i < gross.length; i++) expect(gross[i]!).toBeGreaterThan(gross[i - 1]!);
  });

  it('tools get strictly better and tougher each tier', () => {
    for (const set of [pickaxes, rods, weapons, shovels]) {
      for (let i = 1; i < set.length; i++) {
        expect(set[i]!.cost).toBeGreaterThan(set[i - 1]!.cost);
        expect(set[i]!.durability).toBeGreaterThan(set[i - 1]!.durability);
        expect((set[i]!.mult ?? set[i]!.valueMult)!).toBeGreaterThan((set[i - 1]!.mult ?? set[i - 1]!.valueMult)!);
      }
    }
  });
});

describe('beg and search', () => {
  it('beg payouts stay within the configured ranges', () => {
    const rng = seededRng(4);
    for (let i = 0; i < 5000; i++) {
      const r = rollBeg(1, rng);
      if (r.kind === 'coins') expect(r.coins).toBeLessThanOrEqual(50);
      if (r.kind === 'jackpot') expect(r.coins).toBeGreaterThanOrEqual(200);
    }
  });

  it('search produces every outcome type', () => {
    const rng = seededRng(6);
    const kinds = new Set(Array.from({ length: 2000 }, () => rollSearch(1, rng).kind));
    expect([...kinds].sort()).toEqual(['coins', 'item', 'mishap', 'nothing']);
  });
});

describe('levels and tools', () => {
  it('level curve is consistent', () => {
    expect(xpToNext(0)).toBe(100);
    expect(totalXpForLevel(2)).toBe(xpToNext(0) + xpToNext(1));
    expect(levelFromXp(totalXpForLevel(10))).toMatchObject({ level: 10, into: 0 });
    expect(levelFromXp(totalXpForLevel(10) - 1).level).toBe(9);
  });

  it('repairs cost a fraction of the price, pro rata', () => {
    const wood = pickaxes[0]!;
    expect(repairCost(wood, wood.durability)).toBe(0);
    expect(repairCost(wood, 0)).toBe(Math.ceil(wood.cost * repairCostFraction));
    expect(repairCost(wood, wood.durability / 2)).toBe(Math.ceil((wood.cost * repairCostFraction) / 2));
  });
});

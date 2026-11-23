/**
 * Expected-value model of the economy, computed from src/content.
 * Used by scripts/balance-report.ts (BALANCE.md) and by tests that enforce the balance targets.
 */
import { beg, cooldowns, search } from '../content/earning';
import { getJob, performance, rankFor } from '../content/jobs';
import { findTool, repairCost } from '../content/tools';
import { getItem, searchItemWeights } from '../content/items';
import { gems } from '../content/mining';
import { accountXp, totalXpForLevel } from '../content/levels';
import { expectedCatchValue } from './fishing';
import { expectedGemChance, expectedMineCoins } from './mining';
import { PERFECT_BONUS } from './jobs';

/** How a typical player performs. */
export const assumptions = {
  minigameWin: 0.85,
  perfectShare: 0.3,
  fishCatch: 0.8,
};

export interface Scenario {
  name: string;
  level: number;
  job: string;
  shifts: number;
  pickaxe: string | null;
  rod: string;
}

export const scenarios: Scenario[] = [
  { name: 'New player (first hour)', level: 0, job: 'barista', shifts: 0, pickaxe: null, rod: 'rod_old' },
  { name: 'Early (level 5, day ~2)', level: 5, job: 'coder', shifts: 10, pickaxe: 'pick_iron', rod: 'rod_carbon' },
  { name: 'Mid (level 15, week ~3)', level: 15, job: 'chef', shifts: 40, pickaxe: 'pick_drill', rod: 'rod_pro' },
  { name: 'Late (level 35+)', level: 35, job: 'ceo', shifts: 150, pickaxe: 'pick_excavator', rod: 'rod_legend' },
];

const perHour = (cooldownSeconds: number) => 3600 / cooldownSeconds;
const avg = (range: readonly number[]) => ((range[0] ?? 0) + (range[1] ?? 0)) / 2;

export interface HourlyBreakdown {
  work: number;
  mine: number;
  fish: number;
  beg: number;
  search: number;
  /** Gross income before tool wear. */
  gross: number;
  wear: number;
  net: number;
  xp: number;
}

function workPerShift(jobId: string, shifts: number): number {
  const job = getJob(jobId);
  const winPerf = (performance.slowest + performance.fastest) / 2;
  const perfectBoost = 1 + (PERFECT_BONUS - 1) * (assumptions.perfectShare / assumptions.minigameWin);
  const perf = assumptions.minigameWin * winPerf * perfectBoost + (1 - assumptions.minigameWin) * performance.fail;
  return job.basePay * rankFor(shifts).mult * perf;
}

function gemValuePerMine(): number {
  const totalWeight = gems.reduce((s, g) => s + g.weight, 0);
  const avgGem = gems.reduce((s, g) => s + (g.weight / totalWeight) * (getItem(g.itemId)?.sellPrice ?? 0), 0);
  return expectedGemChance() * avgGem;
}

/** Durability per /mine: 1, plus extra on cave-ins (≈5% on average). */
const MINE_WEAR_PER_USE = 1.2;

export function begPerUse(): number {
  return (1 - beg.nothingChance) * ((1 - beg.jackpotChance) * avg(beg.normal) + beg.jackpotChance * avg(beg.jackpot));
}

export function searchPerUse(): number {
  const totalWeight = Object.values(searchItemWeights).reduce((a, b) => a + b, 0);
  const itemValue = Object.entries(searchItemWeights).reduce((s, [id, w]) => s + (w / totalWeight) * (getItem(id)?.sellPrice ?? 0), 0);
  return search.coinsChance * avg(search.coins) + search.itemChance * itemValue - search.mishapChance * avg(search.mishapLoss);
}

export function hourly(s: Scenario): HourlyBreakdown {
  const pickaxe = findTool('pickaxe', s.pickaxe);
  const rod = findTool('rod', s.rod)!;

  const work = workPerShift(s.job, s.shifts) * perHour(cooldowns.work);
  const mine = (expectedMineCoins(pickaxe?.mult ?? 1) + gemValuePerMine()) * perHour(cooldowns.mine);
  const fish = expectedCatchValue(rod.luck ?? 0, rod.valueMult ?? 1) * assumptions.fishCatch * perHour(cooldowns.fish);
  const begH = begPerUse() * perHour(cooldowns.beg);
  const searchH = searchPerUse() * perHour(cooldowns.search);

  const pickWear = pickaxe ? (repairCost(pickaxe, 0) / pickaxe.durability) * MINE_WEAR_PER_USE * perHour(cooldowns.mine) : 0;
  const rodWear = (repairCost(rod, 0) / rod.durability) * perHour(cooldowns.fish);

  const gross = work + mine + fish + begH + searchH;
  const wear = pickWear + rodWear;
  const xp = avg(accountXp.work) * perHour(cooldowns.work) + avg(accountXp.mine) * perHour(cooldowns.mine)
    + avg(accountXp.fish) * perHour(cooldowns.fish) * assumptions.fishCatch
    + avg(accountXp.beg) * perHour(cooldowns.beg) + avg(accountXp.search) * perHour(cooldowns.search);
  return { work, mine, fish, beg: begH, search: searchH, gross, wear, net: gross - wear, xp };
}

/** Active hours to reach a level, at the hourly XP rate. */
export function hoursToLevel(level: number): number {
  return totalXpForLevel(level) / hourly(scenarios[0]!).xp;
}

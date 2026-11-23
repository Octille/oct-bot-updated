/**
 * Prints expected earnings per active hour, computed straight from src/content.
 * Run: npx tsx scripts/balance-report.ts   (paste the output into BALANCE.md)
 */
import { beg, cooldowns, daily, dailyMultiplier, search, weekly } from '../src/content/earning';
import { getJob, rankFor, performance } from '../src/content/jobs';
import { findTool, repairCost } from '../src/content/tools';
import { getItem, searchItemWeights } from '../src/content/items';
import { gems } from '../src/content/mining';
import { accountXp, totalXpForLevel } from '../src/content/levels';
import { expectedCatchValue } from '../src/game/fishing';
import { expectedGemChance, expectedMineCoins } from '../src/game/mining';
import { PERFECT_BONUS } from '../src/game/jobs';

/** Assumptions about how a typical player performs. */
const assume = {
  /** Share of minigames won, and of fish reeled in time. */
  minigameWin: 0.85,
  perfectShare: 0.3,
  fishCatch: 0.8,
};

const perHour = (cooldownSeconds: number) => 3600 / cooldownSeconds;
const avg = (range: readonly [number, number] | readonly number[]) => ((range[0] ?? 0) + (range[1] ?? 0)) / 2;

function workEv(jobId: string, shifts: number): number {
  const job = getJob(jobId);
  const winPerf = (performance.slowest + performance.fastest) / 2;
  const perfectBoost = 1 + (PERFECT_BONUS - 1) * (assume.perfectShare / assume.minigameWin);
  const perf = assume.minigameWin * winPerf * perfectBoost + (1 - assume.minigameWin) * performance.fail;
  return job.basePay * rankFor(shifts).mult * perf;
}

function mineEv(pickaxeId: string | null): { coins: number; gems: number; wear: number } {
  const tool = findTool('pickaxe', pickaxeId);
  const totalWeight = gems.reduce((s, g) => s + g.weight, 0);
  const gemValue = gems.reduce((s, g) => s + (g.weight / totalWeight) * (getItem(g.itemId)?.sellPrice ?? 0), 0);
  // Average durability per mine is ~1 plus cave-ins; charge it as repair cost
  const wear = tool ? repairCost(tool, tool.durability - 1.5) : 0;
  return { coins: expectedMineCoins(tool?.mult ?? 1), gems: expectedGemChance() * gemValue, wear };
}

function fishEv(rodId: string): { value: number; wear: number } {
  const rod = findTool('rod', rodId)!;
  return { value: expectedCatchValue(rod.luck ?? 0) * assume.fishCatch, wear: repairCost(rod, rod.durability - 1) };
}

function begEv(): number {
  return (1 - beg.nothingChance) * ((1 - beg.jackpotChance) * avg(beg.normal) + beg.jackpotChance * avg(beg.jackpot));
}

function searchEv(): number {
  const totalWeight = Object.values(searchItemWeights).reduce((a, b) => a + b, 0);
  const itemValue = Object.entries(searchItemWeights).reduce((s, [id, w]) => s + (w / totalWeight) * (getItem(id)?.sellPrice ?? 0), 0);
  return search.coinsChance * avg(search.coins) + search.itemChance * itemValue - search.mishapChance * avg(search.mishapLoss);
}

const scenarios = [
  { name: 'New player (first hour)', level: 0, job: 'barista', shifts: 0, pickaxe: null, rod: 'rod_old' },
  { name: 'Early (level 5, day ~3)', level: 5, job: 'coder', shifts: 10, pickaxe: 'pick_iron', rod: 'rod_fiberglass' },
  { name: 'Mid (level 15, week ~4)', level: 15, job: 'chef', shifts: 40, pickaxe: 'pick_diamond', rod: 'rod_pro' },
  { name: 'Late (level 35+)', level: 35, job: 'ceo', shifts: 150, pickaxe: 'pick_excavator', rod: 'rod_legend' },
];

const fmt = (n: number) => `₪ ${Math.round(n).toLocaleString('en-US')}`;
const rows: string[] = [];
rows.push('| Scenario | Work | Mine (+gems) | Fish (item value) | Beg | Search | Tool wear | **Total / hour** | Account XP / hour |');
rows.push('|---|---|---|---|---|---|---|---|---|');
for (const s of scenarios) {
  const work = workEv(s.job, s.shifts) * perHour(cooldowns.work);
  const mine = mineEv(s.pickaxe);
  const mineHour = (mine.coins + mine.gems) * perHour(cooldowns.mine);
  const fish = fishEv(s.rod);
  const fishHour = fish.value * perHour(cooldowns.fish);
  const begHour = begEv() * perHour(cooldowns.beg);
  const searchHour = searchEv() * perHour(cooldowns.search);
  const wear = mine.wear * perHour(cooldowns.mine) + fish.wear * perHour(cooldowns.fish);
  const total = work + mineHour + fishHour + begHour + searchHour - wear;
  const xp = avg(accountXp.work) * perHour(cooldowns.work) + avg(accountXp.mine) * perHour(cooldowns.mine)
    + avg(accountXp.fish) * perHour(cooldowns.fish) * assume.fishCatch + avg(accountXp.beg) * perHour(cooldowns.beg)
    + avg(accountXp.search) * perHour(cooldowns.search);
  rows.push(`| ${s.name} | ${fmt(work)} | ${fmt(mineHour)} | ${fmt(fishHour)} | ${fmt(begHour)} | ${fmt(searchHour)} | −${fmt(wear)} | **${fmt(total)}** | ${Math.round(xp)} |`);
}

const dailyRows = [1, 3, 7, 14, 30, 60].map((d) => `| ${d} | ${dailyMultiplier(d)}× | ${fmt(daily.base * dailyMultiplier(d))} | ${daily.milestones[d] ? fmt(daily.milestones[d]!) : '—'} |`);
const levelRows = [1, 3, 5, 10, 15, 20, 35].map((l) => `| ${l} | ${totalXpForLevel(l).toLocaleString('en-US')} |`);

console.log(['### Active play, per hour', '', ...rows, '',
  `Assumes every command is used as soon as its cooldown ends, ${assume.minigameWin * 100}% of minigames won (${assume.perfectShare * 100}% perfect), ${assume.fishCatch * 100}% of fish reeled in. Fish, gems and search finds are counted at sell price.`,
  '', '### Daily and weekly', '', '| Streak (days) | Multiplier | Daily coins | Milestone bonus |', '|---|---|---|---|', ...dailyRows, '',
  `Weekly: ${fmt(weekly.base)}, +${weekly.perWeekBonus * 100}% per consecutive week up to ${weekly.maxMultiplier}× (${fmt(weekly.base * weekly.maxMultiplier)}).`,
  '', '### Account level (total XP needed)', '', '| Level | Total XP |', '|---|---|', ...levelRows].join('\n'));

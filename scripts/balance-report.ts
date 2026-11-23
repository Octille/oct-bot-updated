/**
 * Prints expected earnings per active hour, computed straight from src/content via src/game/balance.ts.
 * Run: npx tsx scripts/balance-report.ts   (paste the output into BALANCE.md)
 */
import { daily, dailyMultiplier, weekly } from '../src/content/earning';
import { fishdexRewards } from '../src/content/fishing';
import { totalXpForLevel } from '../src/content/levels';
import { assumptions, hourly, hoursToLevel, scenarios } from '../src/game/balance';

const fmt = (n: number) => `₪ ${Math.round(n).toLocaleString('en-US')}`;
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

const income = [
  '| Stage | Work | Mine (+gems) | Fish | Beg | Search | **Gross / hour** | Tool wear | **Net / hour** |',
  '|---|---|---|---|---|---|---|---|---|',
  ...scenarios.map((s) => {
    const h = hourly(s);
    const cell = (v: number) => `${fmt(v)} (${pct(v, h.gross)})`;
    return `| ${s.name} | ${cell(h.work)} | ${cell(h.mine)} | ${cell(h.fish)} | ${cell(h.beg)} | ${cell(h.search)} | **${fmt(h.gross)}** | −${fmt(h.wear)} (${pct(h.wear, h.gross)}) | **${fmt(h.net)}** |`;
  }),
];

const dailyRows = [1, 3, 7, 14, 30, 60, 100].map((d) =>
  `| ${d} | ${dailyMultiplier(d)}× | ${fmt(daily.base * dailyMultiplier(d))} | ${daily.milestones[d] ? fmt(daily.milestones[d]!) : '—'} |`);
const levelRows = [1, 3, 5, 10, 15, 20, 35].map((l) =>
  `| ${l} | ${totalXpForLevel(l).toLocaleString('en-US')} | ${hoursToLevel(l).toFixed(1)} h |`);

console.log([
  '### Active play, per hour', '',
  ...income, '',
  `Assumes every command is used as soon as its cooldown ends, ${assumptions.minigameWin * 100}% of minigames won (${assumptions.perfectShare * 100}% perfect) and ${assumptions.fishCatch * 100}% of fish reeled in. Fish, gems and search finds count at their full value (fresh-catch bonus + sell price). Percentages are each loop's share of gross income.`,
  '', '### Daily and weekly', '',
  '| Streak (days) | Multiplier | Daily coins | Milestone bonus |', '|---|---|---|---|', ...dailyRows, '',
  `Weekly: ${fmt(weekly.base)}, +${weekly.perWeekBonus * 100}% per consecutive week up to ${weekly.maxMultiplier}× (${fmt(weekly.base * weekly.maxMultiplier)}).`,
  '', `Fishdex completion: ${fishdexRewards.map((r) => `${r.percent}% → ${fmt(r.coins)}`).join(', ')} (one-off).`,
  '', '### Account levels', '',
  '| Level | Total XP | Active hours |', '|---|---|---|', ...levelRows,
].join('\n'));

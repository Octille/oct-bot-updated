/**
 * Prints expected earnings per active hour, computed straight from src/content via src/game/balance.ts.
 * Run: npx tsx scripts/balance-report.ts   (paste the output into BALANCE.md)
 */
import { daily, dailyMultiplier, weekly } from '../src/content/earning';
import { fishdexRewards } from '../src/content/fishing';
import { totalXpForLevel } from '../src/content/levels';
import { assumptions, hourly, hoursToLevel, scenarios } from '../src/game/balance';
import { crates } from '../src/content/crates';
import { basics, rotationPool } from '../src/content/shop';
import { expectedCrateValue, expectedScratchValue } from '../src/game/crates';
import { crimes, crimeUnlockLevel } from '../src/content/crime';
import { expectedCrimeValue } from '../src/game/crime';

const fmt = (n: number) => `₪ ${Math.round(n).toLocaleString('en-US')}`;
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

const income = [
  '| Stage | Work | Mine | Fish | Hunt | Dig | Crime | Beg | Search | **Gross / hour** | Tool wear | **Net / hour** |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...scenarios.map((s) => {
    const h = hourly(s);
    const cell = (v: number) => `${fmt(v)} (${pct(v, h.gross)})`;
    return `| ${s.name} | ${cell(h.work)} | ${cell(h.mine)} | ${cell(h.fish)} | ${cell(h.hunt)} | ${cell(h.dig)} | ${cell(h.crime)} | ${cell(h.beg)} | ${cell(h.search)} | **${fmt(h.gross)}** | −${fmt(h.wear)} (${pct(h.wear, h.gross)}) | **${fmt(h.net)}** |`;
  }),
];

const dailyRows = [1, 3, 7, 14, 30, 60, 100].map((d) =>
  `| ${d} | ${dailyMultiplier(d)}× | ${fmt(daily.base * dailyMultiplier(d))} | ${daily.milestones[d] ? fmt(daily.milestones[d]!) : '—'} |`);
const levelRows = [1, 3, 5, 10, 15, 20, 35].map((l) =>
  `| ${l} | ${totalXpForLevel(l).toLocaleString('en-US')} | ${hoursToLevel(l).toFixed(1)} h |`);

console.log([
  '### Active play, per hour', '',
  ...income, '',
  `Assumes every command is used as soon as its cooldown ends, ${assumptions.minigameWin * 100}% of minigames won (${assumptions.perfectShare * 100}% perfect), ${assumptions.fishCatch * 100}% of fish reeled in and ${assumptions.huntHit * 100}% of hunts hit. Finds count at their full value (instant bonus + sell price). Crime (unlocked at level ${crimeUnlockLevel}) is the average of the three crimes. Percentages are each loop's share of gross income. A new player has no weapon or shovel yet, so hunt and dig are zero in the first row.`,
  '', '### Crime (expected coins per attempt)', '',
  '| Crime | Success | Payout | Fine + jail | Expected |', '|---|---|---|---|---|',
  ...crimes.map((c) => `| ${c.name} | ${Math.round(c.success * 100)}% | ${fmt(c.payout[0])}–${fmt(c.payout[1])} | ${fmt(c.fine)} + ${c.jailMinutes} min | ${fmt(expectedCrimeValue(c))} |`),
  '', '### Shop sinks', '',
  '| Item | Price | Average value back |', '|---|---|---|',
  ...crates.map((c) => {
    const price = basics.find((b) => b.id === c.itemId)?.price ?? rotationPool.find((r) => r.id === c.itemId)?.price;
    return `| ${c.itemId} | ${price ? fmt(price) : 'rewards only'} | ${fmt(expectedCrateValue(c))}${price ? ` (${pct(expectedCrateValue(c), price)})` : ''} |`;
  }),
  `| scratch_card | ${fmt(1_000)} | ${fmt(expectedScratchValue())} (${pct(expectedScratchValue(), 1_000)}) |`,
  '', 'Consumables (boosts, bank notes, streak freezes), cosmetics, tool upgrades and repairs are pure sinks.',
  '', '### Daily and weekly', '',
  '| Streak (days) | Multiplier | Daily coins | Milestone bonus |', '|---|---|---|---|', ...dailyRows, '',
  `Weekly: ${fmt(weekly.base)}, +${weekly.perWeekBonus * 100}% per consecutive week up to ${weekly.maxMultiplier}× (${fmt(weekly.base * weekly.maxMultiplier)}).`,
  '', `Fishdex completion: ${fishdexRewards.map((r) => `${r.percent}% → ${fmt(r.coins)}`).join(', ')} (one-off).`,
  '', '### Account levels', '',
  '| Level | Total XP | Active hours |', '|---|---|---|', ...levelRows,
].join('\n'));

/**
 * Prints the combined daily income table and the level-35 coin sinks (BALANCE.md).
 *   npx tsx scripts/income-report.ts
 */
import { hourly, scenarios } from '../src/game/balance';
import { businessRules, businessTiers } from '../src/content/business';
import { petRules } from '../src/content/pets';
import { bizHours, HOURS, rows } from '../src/game/income';

const table = rows();
const fmt = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number, t: number) => `${((n / t) * 100).toFixed(0)}%`;
const keys = ['activities', 'quests', 'drops', 'raid', 'goal', 'business', 'pet', 'season'] as const;
console.log(`| Source (per day) | ${table.map((r) => `Lv ${r.level}`).join(' | ')} |`);
console.log(`|---|${table.map(() => '---').join('|')}|`);
for (const k of keys) console.log(`| ${k} | ${table.map((r) => `${fmt(r.sources[k])} (${pct(r.sources[k], r.total)})`).join(' | ')} |`);
console.log(`| **Total** | ${table.map((r) => `**${fmt(r.total)}**`).join(' | ')} |`);
console.log(`| 2a baseline (1.5 h) | ${table.map((r) => fmt(r.base)).join(' | ')} |`);
console.log(`| vs 2a | ${table.map((r) => `${r.over >= 0 ? '+' : ''}${(r.over * 100).toFixed(0)}%${r.over > 0.2 ? ' ⚠️' : ''}`).join(' | ')} |`);

/* ── Coin sinks for the same engaged player at level 35 (per day) ─────────────────────────── */
const late = table.at(-1)!;
const s35 = scenarios.at(-1)!;
const sinks: [string, number, string][] = [
  ['Tool wear and repairs', HOURS * hourly(s35).wear, 'already taken out of activity income above'],
  ['Business upkeep (10%)', bizHours[3]! * businessTiers.at(-1)!.perWorkerHour * businessTiers.at(-1)!.maxWorkers * businessRules.upkeep, 'already taken out of business income above'],
  ['Pet food', 2 * petRules.feed.cost, 'two feeds a day'],
  ['Give / trade tax (5%)', 0.05 * 20_000, 'assumes ₪20k sent a day'],
  ['Duel tax (5% of the pot)', 0.05 * 2 * 10_000, 'assumes one ₪10k duel a day'],
  ['Casino house edge', 0.03 * 0.1 * late.total, 'assumes 10% of income wagered at ~3% edge'],
  ['Cosmetics', 100_000 / 14, 'one ₪100k cosmetic every two weeks'],
  ['Prestige wipe', 0.25 * late.total, 'wallet, bank and loot reset; assumes 25% of earnings still held at prestige'],
];
const sinkTotal = sinks.reduce((a, [, n]) => a + n, 0);
const gross = late.total + sinks[0]![1] + sinks[1]![1];
console.log('');
console.log('| Sink at level 35 (per day) | ₪/day | Share of gross income | Assumption |');
console.log('|---|---|---|---|');
for (const [name, n, note] of sinks) console.log(`| ${name} | ${fmt(n)} | ${pct(n, gross)} | ${note} |`);
console.log(`| **Total** | **${fmt(sinkTotal)}** | **${pct(sinkTotal, gross)}** | gross = ${fmt(gross)} |`);

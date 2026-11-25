/**
 * Combined daily income for an engaged player (1.5 active hours a day), every source, by stage.
 *   npx tsx scripts/income-report.ts
 * Assumptions are listed at the bottom of the output and in BALANCE.md.
 */
import { hourly, scenarios } from '../src/game/balance';
import { questRewards } from '../src/content/quests';
import { expectedCrateValue } from '../src/game/crates';
import { getCrate } from '../src/content/crates';
import { dropRules, goalRules, raidRules, seasonRules } from '../src/content/events';
import { businessRules, businessTiers } from '../src/content/business';
import { pets, petRules } from '../src/content/pets';

const crate = (id: string) => expectedCrateValue(getCrate(id)!);
const HOURS = 1.5;
/** Pre-Phase-5 hourly totals (2a), the baseline. */
const BASE_2A = [15_300, 31_300, 68_900, 129_900];
const DROPS_PER_DAY = 3;
const RAID_FIGHTERS = 5;
const stageBiz = [null, 'stand', 'truck', 'factory'] as const;
const stagePetLevel = [0, 1, 5, 10];
const bizHours = [0, 16, 16, 24]; // collected twice a day; manager at late game

const rows = scenarios.map((s, i) => {
  const activities = HOURS * hourly(s).net;
  const quests = 3 * questRewards.daily.coins(s.level) + crate(questRewards.daily.bonus(s.level))
    + (3 * questRewards.weekly.coins(s.level) + crate(questRewards.weekly.bonus(s.level))) / 7;
  const avgDrop = (1 - dropRules.crateChance) * (dropRules.coins[0] + dropRules.coins[1]) / 2 + dropRules.crateChance * crate('crate_common');
  const drops = DROPS_PER_DAY * avgDrop;
  const raidCrates = (crate(raidRules.reward.mvp) + 2 * crate(raidRules.reward.top3) + (RAID_FIGHTERS - 3) * crate(raidRules.reward.crate)) / RAID_FIGHTERS;
  const raid = (raidRules.reward.base + raidRules.reward.perShare / RAID_FIGHTERS + raidCrates) / 7;
  const goal = (goalRules.reward.coins + crate(goalRules.reward.crate)) / 7;
  const tier = businessTiers.find((t) => t.id === stageBiz[i]);
  const business = tier ? tier.perWorkerHour * tier.maxWorkers * bizHours[i]! * (1 - businessRules.upkeep) : 0;
  const petLevel = stagePetLevel[i]!;
  const pet = petLevel ? activities * (pets.parrot.perkAtMax * petLevel / petRules.maxLevel) - 2 * petRules.feed.cost : 0;
  const top100 = seasonRules.rewards.at(-1)!;
  const season = (top100.coins + crate(top100.crate)) / seasonRules.lengthDays;
  const sources = { activities, quests, drops, raid, goal, business, pet, season };
  const total = Object.values(sources).reduce((a, b) => a + b, 0);
  const base = HOURS * BASE_2A[i]!;
  return { name: s.name, level: s.level, sources, total, base, over: total / base - 1 };
});

const fmt = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number, t: number) => `${((n / t) * 100).toFixed(0)}%`;
const keys = ['activities', 'quests', 'drops', 'raid', 'goal', 'business', 'pet', 'season'] as const;
console.log(`| Source (per day) | ${rows.map((r) => `Lv ${r.level}`).join(' | ')} |`);
console.log(`|---|${rows.map(() => '---').join('|')}|`);
for (const k of keys) console.log(`| ${k} | ${rows.map((r) => `${fmt(r.sources[k])} (${pct(r.sources[k], r.total)})`).join(' | ')} |`);
console.log(`| **Total** | ${rows.map((r) => `**${fmt(r.total)}**`).join(' | ')} |`);
console.log(`| 2a baseline (1.5 h) | ${rows.map((r) => fmt(r.base)).join(' | ')} |`);
console.log(`| vs 2a | ${rows.map((r) => `${r.over >= 0 ? '+' : ''}${(r.over * 100).toFixed(0)}%${r.over > 0.2 ? ' ⚠️' : ''}`).join(' | ')} |`);

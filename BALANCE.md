# OctBot 3.0 — Balance

All numbers live in `src/content/`. The tables below are generated from them:

```
npx tsx scripts/balance-report.ts
```

Re-run it after changing any number and paste the output here, so this file never drifts from the real config.

## Design targets

- **First 10 minutes:** a new player earns enough for the Wooden Pickaxe (₪ 2,000) and has tried every earning command.
- **Daily player (~30 min/day):** reaches a new unlock every few days. That's roughly 500–600 account XP/day: level 5 (Coder, Gold Pickaxe, Carbon Rod, a Rare Crate) around day 2, level 10 (Chef, Diamond Pickaxe, an Epic Crate) around day 7, and level 20 around day 30.
- **Endgame takes weeks of steady play:** level 35 (CEO) in about 60–80 active hours (currently ~65).
- **No single loop is more than ~35% of income at any stage.** From level 5 on, work, mining and fishing each carry about 20–25%, hunting and digging about 12–19%, and crime, beg and search the rest.
  - Mining scales with pickaxe tier.
  - Fishing, hunting and digging scale with their tool tier (luck + value multiplier).
  - Fishing also pays fishdex completion rewards.
  - Work scales with job and rank.
- **Tool wear is 10–15% of income** once you own real tools. It's the main early-game coin sink.
- **Every coin source has a sink:** tool wear and repairs, boosts and bank notes, cosmetics, shop crates (worth ~90% of their price), scratch cards (15% house edge), bail, the transfer tax and, in later phases, the gambling edge and business upkeep.

These targets are enforced by tests in `tests/game.test.ts` ("balance targets"), so changing a number that breaks them fails the build.

## Current numbers

### Active play, per hour

| Stage | Work | Mine | Fish | Hunt | Dig | Crime | Beg | Search | **Gross / hour** | Tool wear | **Net / hour** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| New player (first hour) | ₪ 2,798 (18%) | ₪ 3,260 (21%) | ₪ 5,309 (35%) | ₪ 0 (0%) | ₪ 0 (0%) | ₪ 0 (0%) | ₪ 1,341 (9%) | ₪ 2,555 (17%) | **₪ 15,262** | −₪ 110 (1%) | **₪ 15,152** |
| Early (level 5, day ~2) | ₪ 8,616 (19%) | ₪ 8,684 (19%) | ₪ 10,119 (23%) | ₪ 5,375 (12%) | ₪ 6,337 (14%) | ₪ 1,860 (4%) | ₪ 1,341 (3%) | ₪ 2,555 (6%) | **₪ 44,887** | −₪ 4,474 (10%) | **₪ 40,413** |
| Mid (level 15, week ~3) | ₪ 22,380 (21%) | ₪ 22,246 (21%) | ₪ 20,351 (20%) | ₪ 13,998 (13%) | ₪ 19,422 (19%) | ₪ 1,860 (2%) | ₪ 1,341 (1%) | ₪ 2,555 (2%) | **₪ 104,154** | −₪ 12,687 (12%) | **₪ 91,467** |
| Late (level 35+) | ₪ 44,760 (24%) | ₪ 43,945 (24%) | ₪ 37,322 (20%) | ₪ 23,794 (13%) | ₪ 30,622 (16%) | ₪ 1,860 (1%) | ₪ 1,341 (1%) | ₪ 2,555 (1%) | **₪ 186,199** | −₪ 26,383 (14%) | **₪ 159,817** |

Assumes every command is used as soon as its cooldown ends, 85% of minigames won (30% perfect), 80% of fish reeled in and 75% of hunts hit. Finds count at their full value (instant bonus + sell price). Crime (unlocked at level 3) is the average of the three crimes. Percentages are each loop's share of gross income. A new player has no weapon or shovel yet, so hunt and dig are zero in the first row.

### Crime (expected coins per attempt)

| Crime | Success | Payout | Fine + jail | Expected |
|---|---|---|---|---|
| Pickpocket | 75% | ₪ 300–₪ 700 | ₪ 300 + 2 min | ₪ 300 |
| Shoplift | 55% | ₪ 800–₪ 1,800 | ₪ 800 + 5 min | ₪ 355 |
| Hack an ATM | 35% | ₪ 3,000–₪ 6,000 | ₪ 2,000 + 10 min | ₪ 275 |

### Shop sinks

| Item | Price | Average value back |
|---|---|---|
| crate_common | ₪ 5,000 | ₪ 4,452 (89%) |
| crate_rare | ₪ 22,500 | ₪ 21,353 (95%) |
| crate_epic | ₪ 90,000 | ₪ 82,184 (91%) |
| crate_legendary | ₪ 400,000 | ₪ 366,300 (92%) |
| scratch_card | ₪ 1,000 | ₪ 853 (85%) |

Consumables (boosts, bank notes, streak freezes), cosmetics, tool upgrades and repairs are pure sinks.

### Daily and weekly

| Streak (days) | Multiplier | Daily coins | Milestone bonus |
|---|---|---|---|
| 1 | 1× | ₪ 7,500 | — |
| 3 | 1.25× | ₪ 9,375 | ₪ 2,500 |
| 7 | 1.5× | ₪ 11,250 | ₪ 10,000 |
| 14 | 1.75× | ₪ 13,125 | ₪ 25,000 |
| 30 | 2× | ₪ 15,000 | ₪ 75,000 |
| 60 | 2.5× | ₪ 18,750 | ₪ 200,000 |
| 100 | 2.5× | ₪ 18,750 | ₪ 500,000 |

Weekly: ₪ 20,000, +10% per consecutive week up to 2× (₪ 40,000).

Fishdex completion: 25% → ₪ 15,000, 50% → ₪ 60,000, 75% → ₪ 200,000, 100% → ₪ 750,000 (one-off).

### Account levels

| Level | Total XP | Active hours |
|---|---|---|
| 1 | 100 | 0.1 h |
| 3 | 420 | 0.5 h |
| 5 | 943 | 1.2 h |
| 10 | 3,459 | 3.6 h |
| 15 | 8,322 | 8.3 h |
| 20 | 16,308 | 16.1 h |
| 35 | 66,750 | 65.1 h |

## Migration ceiling (Phase 7)

The v2 migration caps corrupt balances at a ceiling derived from the late-game row above. The plan is roughly 30 days of heavy late-game play: late-game ₪/hour × 4 hours × 30 days. With the current numbers that's **≈ ₪ 22.3M**. The exact figure is recomputed from this table when the migration runs.

# OctBot 3.0 — Balance

All numbers live in `src/content/`. The tables below are generated from them:

```
npx tsx scripts/balance-report.ts
```

Re-run it after changing any number and paste the output here, so this file never drifts from the real config.

## Design targets

- **First 10 minutes:** a new player earns enough for the Wooden Pickaxe (₪ 2,000) and has tried every earning command.
- **Daily player (~30 min/day):** reaches a new unlock every few days. That's roughly 450 account XP/day: level 5 (Coder, Gold Pickaxe, Carbon Rod) around day 2, level 10 (Chef, Diamond Pickaxe) around day 7, and level 20 around day 33.
- **Endgame takes weeks of steady play:** level 35 (CEO) in about 60–80 active hours.
- **No single loop is more than ~35% of income at any stage.** Work, mining and fishing each carry about a third from level 5 on.
  - Mining scales with pickaxe tier.
  - Fishing scales with rod tier (luck + value multiplier) and pays fishdex completion rewards.
  - Work scales with job and rank.
- **Tool wear is 10–15% of income** once you own real tools. It's the main early-game coin sink.
- **Every coin source has a sink:** tool wear and repairs, the transfer tax and, in later phases, the shop, crates, cosmetics, gambling edge and business upkeep.

These targets are enforced by tests in `tests/game.test.ts` ("balance targets"), so changing a number that breaks them fails the build.

## Current numbers

### Active play, per hour

| Stage | Work | Mine (+gems) | Fish | Beg | Search | **Gross / hour** | Tool wear | **Net / hour** |
|---|---|---|---|---|---|---|---|---|
| New player (first hour) | ₪ 2,798 (18%) | ₪ 3,260 (21%) | ₪ 5,309 (35%) | ₪ 1,341 (9%) | ₪ 2,555 (17%) | **₪ 15,262** | −₪ 110 (1%) | **₪ 15,152** |
| Early (level 5, day ~2) | ₪ 8,616 (28%) | ₪ 8,684 (28%) | ₪ 10,119 (32%) | ₪ 1,341 (4%) | ₪ 2,555 (8%) | **₪ 31,315** | −₪ 3,206 (10%) | **₪ 28,110** |
| Mid (level 15, week ~3) | ₪ 22,380 (32%) | ₪ 22,246 (32%) | ₪ 20,351 (30%) | ₪ 1,341 (2%) | ₪ 2,555 (4%) | **₪ 68,874** | −₪ 8,213 (12%) | **₪ 60,660** |
| Late (level 35+) | ₪ 44,760 (34%) | ₪ 43,945 (34%) | ₪ 37,322 (29%) | ₪ 1,341 (1%) | ₪ 2,555 (2%) | **₪ 129,924** | −₪ 17,504 (13%) | **₪ 112,420** |

Assumes every command is used as soon as its cooldown ends, 85% of minigames won (30% perfect) and 80% of fish reeled in. Fish, gems and search finds count at their full value (fresh-catch bonus + sell price). Percentages are each loop's share of gross income.

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
| 3 | 418 | 0.5 h |
| 5 | 926 | 1.2 h |
| 10 | 3,290 | 4.1 h |
| 15 | 7,716 | 9.6 h |
| 20 | 14,830 | 18.5 h |
| 35 | 58,546 | 73.1 h |

## Migration ceiling (Phase 7)

The v2 migration caps corrupt balances at a ceiling derived from the late-game row above. The plan is roughly 30 days of heavy late-game play: late-game ₪/hour × 4 hours × 30 days. With the current numbers that's **≈ ₪ 15.6M**. The exact figure is recomputed from this table when the migration runs.

# OctBot 3.0 — Balance

All numbers live in `src/content/`. The tables below are generated from them:

```
npx tsx scripts/balance-report.ts
```

Re-run it after changing any number and paste the output here, so this file never drifts from the real config.

## Design targets

- **First 10 minutes:** a new player earns enough for the Wooden Pickaxe (₪ 2,000) and has tried every earning command.
- **Daily player (~30 min/day):** reaches a new unlock every few days. That's roughly 450 account XP/day: level 5 (Coder, Gold Pickaxe, Carbon Rod) around day 3, and level 10 (Chef, Diamond Pickaxe) around day 13.
- **Endgame takes weeks:** the CEO job and Excavator sit at levels 35 and 20.
- **Mining is the scaling income** (tools multiply it), **work is steady** (rank-ups), and **fishing is a collection loop** whose value comes from rare catches and the fishdex.
- **Every coin source has a sink:** tool wear and repairs (in the table), plus the transfer tax and, coming in later phases, shop, crates, cosmetics, gambling edge and business upkeep.

## Phase 2a numbers

### Active play, per hour

| Scenario | Work | Mine (+gems) | Fish (item value) | Beg | Search | Tool wear | **Total / hour** | Account XP / hour |
|---|---|---|---|---|---|---|---|---|
| New player (first hour) | ₪ 2,798 | ₪ 3,260 | ₪ 3,431 | ₪ 1,341 | ₪ 2,555 | −₪ 160 | **₪ 13,224** | 801 |
| Early (level 5, day ~3) | ₪ 6,770 | ₪ 11,397 | ₪ 3,786 | ₪ 1,341 | ₪ 2,555 | −₪ 1,508 | **₪ 24,340** | 801 |
| Mid (level 15, week ~4) | ₪ 13,988 | ₪ 33,096 | ₪ 4,331 | ₪ 1,341 | ₪ 2,555 | −₪ 8,920 | **₪ 46,391** | 801 |
| Late (level 35+) | ₪ 67,140 | ₪ 95,481 | ₪ 4,545 | ₪ 1,341 | ₪ 2,555 | −₪ 34,116 | **₪ 136,946** | 801 |

Assumes every command is used as soon as its cooldown ends, 85% of minigames won (30% perfect), 80% of fish reeled in. Fish, gems and search finds are counted at sell price.

### Daily and weekly

| Streak (days) | Multiplier | Daily coins | Milestone bonus |
|---|---|---|---|
| 1 | 1× | ₪ 2,500 | — |
| 3 | 1.25× | ₪ 3,125 | ₪ 2,500 |
| 7 | 1.5× | ₪ 3,750 | ₪ 10,000 |
| 14 | 1.75× | ₪ 4,375 | ₪ 25,000 |
| 30 | 2× | ₪ 5,000 | ₪ 75,000 |
| 60 | 2.5× | ₪ 6,250 | ₪ 200,000 |

Weekly: ₪ 20,000, +10% per consecutive week up to 2× (₪ 40,000).

### Account level (total XP needed)

| Level | Total XP |
|---|---|
| 1 | 100 |
| 3 | 520 |
| 5 | 1,340 |
| 10 | 5,980 |
| 15 | 15,920 |
| 20 | 33,160 |
| 35 | 148,680 |

## Migration ceiling (Phase 7)

The v2 migration caps corrupt balances at a ceiling derived from the late-game row above. The plan is roughly 30 days of heavy late-game play: late-game ₪/hour × 4 hours × 30 days. With the current numbers that's **≈ ₪ 16.4M**. The exact figure is recomputed from this table when the migration runs.

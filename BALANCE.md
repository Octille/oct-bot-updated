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
- **More loops mean more choice, not more coins.** Total income per stage stays within ~5% of the Phase 2a numbers (₪15k / ₪31k / ₪69k / ₪130k per active hour); hunting, digging and crime split the same pie.
- **No single loop is more than ~35% of income at any stage.** From level 5 on, work, mining and fishing each carry about 16–27%, hunting about 9–11%, digging 11–15%, and crime, beg and search the rest.
  - Mining scales with pickaxe tier.
  - Fishing, hunting and digging scale with their tool tier (luck + value multiplier).
  - Fishing also pays fishdex completion rewards.
  - Work scales with job and rank.
- **Tool wear is 10–15% of income** mid and late game, and gentler early on (~8%) so the first days feel generous.
- **Every coin source has a sink:** tool wear and repairs, boosts and bank notes, cosmetics, shop crates (worth ~90% of their price), scratch cards (15% house edge), bail, the transfer tax and, in later phases, the gambling edge and business upkeep.
- **/dig** gives up to 3 digs with 🔥 hot / 🌡️ warm / ❄️ cold hints: a player who follows them finds the treasure ~78–85% of the time (simulated in tests); starting in the centre is a trap.
- **/crime** pays little on purpose. Its reason to exist is crime-only loot (Stolen Watch → The Mona Octa) and, in Phase 3, crime achievements and titles.
- **The shop rotation** has per-player daily limits (e.g. 1 Legendary Crate per player per day), not shared stock.

These targets are enforced by tests in `tests/game.test.ts` ("balance targets"), so changing a number that breaks them fails the build.

## Current numbers

### Active play, per hour

| Stage | Work | Mine | Fish | Hunt | Dig | Crime | Beg | Search | **Gross / hour** | Tool wear | **Net / hour** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| New player (first hour) | ₪ 2,798 (18%) | ₪ 3,260 (21%) | ₪ 5,309 (35%) | ₪ 0 (0%) | ₪ 0 (0%) | ₪ 0 (0%) | ₪ 1,341 (9%) | ₪ 2,555 (17%) | **₪ 15,262** | −₪ 75 (0%) | **₪ 15,187** |
| Early (level 5, day ~2) | ₪ 5,231 (16%) | ₪ 5,972 (18%) | ₪ 7,591 (23%) | ₪ 2,973 (9%) | ₪ 4,431 (14%) | ₪ 2,302 (7%) | ₪ 1,341 (4%) | ₪ 2,555 (8%) | **₪ 32,396** | −₪ 2,618 (8%) | **₪ 29,778** |
| Mid (level 15, week ~3) | ₪ 15,037 (22%) | ₪ 15,194 (22%) | ₪ 14,591 (22%) | ₪ 7,349 (11%) | ₪ 9,447 (14%) | ₪ 2,302 (3%) | ₪ 1,341 (2%) | ₪ 2,555 (4%) | **₪ 67,815** | −₪ 8,650 (13%) | **₪ 59,165** |
| Late (level 35+) | ₪ 34,913 (27%) | ₪ 33,909 (27%) | ₪ 26,247 (21%) | ₪ 11,990 (9%) | ₪ 14,690 (11%) | ₪ 2,302 (2%) | ₪ 1,341 (1%) | ₪ 2,555 (2%) | **₪ 127,947** | −₪ 17,988 (14%) | **₪ 109,959** |

Assumes every command is used as soon as its cooldown ends, 85% of minigames won (30% perfect), 80% of fish reeled in and 75% of hunts hit. Finds count at their full value (instant bonus + sell price). Crime (unlocked at level 3) is the average of the three crimes. Percentages are each loop's share of gross income. A new player has no weapon or shovel yet, so hunt and dig are zero in the first row.

### Crime (expected coins per attempt)

| Crime | Success | Payout | Fine + jail | Expected |
|---|---|---|---|---|
| Pickpocket | 75% | ₪ 300–₪ 700 | ₪ 300 + 2 min | ₪ 360 |
| Shoplift | 55% | ₪ 800–₪ 1,800 | ₪ 800 + 5 min | ₪ 432 |
| Hack an ATM | 35% | ₪ 3,000–₪ 6,000 | ₪ 2,000 + 10 min | ₪ 359 |

### Shop sinks

| Item | Price | Average value back |
|---|---|---|
| crate_common | ₪ 5,000 | ₪ 4,452 (89%) |
| crate_rare | ₪ 22,500 | ₪ 21,353 (95%) |
| crate_epic | ₪ 90,000 | ₪ 82,184 (91%) |
| crate_legendary | ₪ 400,000 | ₪ 365,700 (91%) |
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

## Server levels (Phase 3)

Per server, separate from account levels. XP to the next level is `5L² + 50L + 100`. Chat gives 15–25 XP (average 20) for at most one message a minute; voice gives 10 XP a minute with company. Multipliers (0.5–3×, highest wins) and double XP scale these.

| Server level | Total XP | Counted messages (avg 20 XP) | Or voice hours |
|---|---|---|---|
| 1 | 100 | 5 | 0.2 |
| 5 | 1,150 | 58 | 1.9 |
| 10 | 4,675 | 234 | 7.8 |
| 20 | 23,850 | 1,193 | 40 |
| 30 | 67,525 | 3,376 | 113 |
| 50 | 268,375 | 13,419 | 447 |

## Prestige (Phase 3)

Needs account level 35 (about 65 active hours the first time). Resets level, XP, wallet (to ₪1,000) and bank; keeps everything else, and unlocks use the best-ever level. Each prestige: +5% coins for good and 1 token (2 from prestige 5). Re-levelling to 35 takes the same ~65 hours of actions, minus the Scholar perk (+15% XP) and faster coin income from kept late-game tools. Max prestige 10 = +50% coins; 15 tokens in total, perks and prestige cosmetics cost 15.

## Gambling (Phase 4)

Bets ₪100 up to ₪10,000 + ₪5,000 per (best-ever) account level, max ₪250,000. Per game the max bet is also limited so one round never pays more than ₪2,500,000 (high-low and crash cash out automatically at that point instead). Bets are taken when the round starts and paid at the end.

| Game | Rules | House edge |
|---|---|---|
| Coinflip | 50% to win 1.95× | 2.50% (exact) |
| Slots | 3 reels, 7 symbols; three of a kind 4–25×, two cherries 2.2×, any pair 1.5× (46.7% of spins pay) | 4.63% (exact) |
| Blackjack | 6 decks, dealer stands on 17, blackjack 3:2, double on any two, no split | 1.14% (2M-hand basic-strategy simulation) |
| High-low | next card higher/lower, ties win; each step pays fair odds × 0.97 | 3% per guess |
| Roulette | European, single zero; 2× / 3× / 36× | 2.70% (exact) |
| Crash | P(crash ≥ x) = 0.97 / x; ~4% of rounds end at 1.00× | 3.00% (exact) |

## Social (Phase 4)

- **Rob** (level 5, 30m cooldown): target must have played, been active in the last 24h and hold ₪2,500+. Chance 40% ± 1.5% per level difference (15–60%), −15% against a guard dog. Steals 10–25% of their wallet (max ₪50,000), held 30s: the victim can catch the robber (loot back, fine, 15m jail). Failing costs a fine of 10% of your wallet (₪500–10,000, paid to the target), 35% chance of 10m jail. A padlock blocks one robbery. Targets are protected for an hour after any attempt. Coins only move between players.
- **Heist** (level 10, 4h cooldown, crews of 2–6): ₪5,000 stake each; success 48% (2) → 75% (5+); success pays ₪11,000 each, failure loses the stake (40% jail chance each). It's the only social source of new coins: at most about ₪800/hour per player, under 3% of early-game income.
- **Duel** (level 3): both stake the same; the pot minus 5% goes to whoever clicks DRAW! first.
- **Give / trade coins**: 5% tax. Give, gift and trade need level 3, and only work with players who already have a profile.
- **Anti-alt** (give, gift, trade, duel, being robbed, joining a heist): Discord account 30+ days old and OctBot profile 3+ days old (`antiAlt` in content/social.ts).
- **Daily giving limit** (give, gift and your side of trades, per UTC day): coins 10,000 × account level (max ₪500,000), items 20 (`dailyGiveLimit`).
- **Interrupted rounds**: blackjack, high-low, crash (and the quick games), duels and heists are recorded while open; a restart refunds the stakes at startup and tells the player by DM, or in the channel if DMs are closed.

## Quests (Phase 5a)

3 daily quests (reset 00:00 UTC) and 3 weekly (Monday 00:00 UTC), picked from what the player can do. One reroll per set.

| Reward | Formula | Level 5 | Level 15 | Level 35 |
|---|---|---|---|---|
| Daily quest | ₪250 + ₪75 × level, 40 XP | ₪625 | ₪1,375 | ₪2,875 |
| All 3 daily | Common Crate (Rare from level 10) | | | |
| Weekly quest | ₪1,500 + ₪350 × level, 250 XP | ₪3,250 | ₪6,750 | ₪13,750 |
| All 3 weekly | Rare Crate (Epic from level 20) | | | |

Per day (dailies + a seventh of the weeklies), at 1.5 active hours a day, with bonus crates counted at their **opened** value: 28.1% new, 19.4% early, 26.1% mid, 22.4% late. Coins alone are only 4–7%; the bonus crates are the rest (24% / 14% / 20% / 16%). Counting crates at their sell value instead gives 13–17%. Test band: 10–30% with opened values. Quests only count real activity: "sell" quests are fish only (shop items sell back below cost), chat messages count once a minute across all servers, and daily/weekly claims don't count as "earned".

## Leaderboards (Phase 5a)

Values are stored on each profile (`board.*`), recomputed inside MongoDB after every change and indexed, so a board is a top-N query, not a scan. Net worth (wallet + bank + item value), server level, account level (prestige first), fish caught, gambling winnings (net, only players ahead), daily streak, fishdex, achievements. This server (members) or global, 10 per page, cached for a minute.

## Migration ceiling (Phase 7)

The v2 migration caps corrupt balances at a ceiling derived from the late-game row above. The plan is roughly 30 days of heavy late-game play: late-game ₪/hour × 4 hours × 30 days. With the current numbers that's **≈ ₪ 15.4M**. The exact figure is recomputed from this table when the migration runs.

# OctBot 3.0 — Plan

Status: **approved** — building on the `v3` branch. Phases 1, 2a and 2b done.

## 0. What I found in the current code

The brief's list of problems is accurate, with these corrections and additions:

| Finding | Detail |
|---|---|
| Manager is worse than "does nothing" | Nothing auto-collects, and `!collect` refuses to run when you own a Manager, so Manager owners can **never** receive wages (1 live user affected). |
| `!daily` survives restarts | It is guarded by the persisted `lastDaily`. `mine`, `fish`, `heist`, `rob`, `beg` and `coinflip` do reset on restart (in-memory cooldowns). |
| Two `awardXP` functions | `functions/xp.js` takes `(message, source)` and `functions/economy.js` takes `(message, profileModel, source)`. `beg` and `balance` use one, everything else the other. Level-up perk text differs between them. |
| Race conditions | Confirmed in deposit (`all`), withdraw, transfer, rob (two separate `$inc`s), buy, coinflip, company buy. |
| Coinflip | Confirmed: says "won 2×", pays 1×. |

**Live data (read-only check of your Atlas DB):**

| Collection | Docs | Notes |
|---|---|---|
| `profilemodels` | 77,801 | Mostly v12-era docs: `coins`, `bank`, `Items`, `Company`, old `commands_cooldowns`. Max account level 3, nobody has prestiged, 18 have workers. |
| `guilds` | 317 | prefix, welcomeID, InviteLinks (+ newer autorole/ticket fields) |
| `autoroles`, `reactionroles`, `ticketdatas` | 8 / 50 / 7 | **Old v12 collections still in use by servers.** |
| `afks` | 0 | |

**Some balances are corrupt:** largest wallet ≈ ₪1.49 × 10⁵⁷ and largest bank ≈ ₪5 × 10³¹ (old exploits). These exceed what a JS number can represent exactly and would break leaderboards, net worth and the inflation stats. The migration has to clamp them (see open questions).

## 1. Architecture

```
Discord ──► events/ ──► router ──► commands/ (slash)  ──┐
                          │                             │
                          └──► components/ (buttons,    ├──► services/ ──► models/ (Mongoose)
                               selects, modals by       │      economy, inventory, xp,
                               customId prefix)         │      cooldowns, quests, ...
scheduler (node-cron) ──────────────────────────────────┘
content/*.ts  ◄── every number, item, loot table, job, quest, achievement
lib/          ◄── embeds, formatting, amount parser, canvas, RNG, component helpers
```

Rules that every part follows:

- **Commands are thin.** They parse input, call services and render. No `$inc` anywhere outside `services/`.
- **One economy service** owns every balance and item change. Each change is a single conditional update:
  - debit: `{ _id, wallet: { $gte: amt } }` → `$inc: { wallet: -amt }`
  - two-party moves (transfer, rob, trade, duel, heist split) run in a **Mongo transaction**
  - every change writes a row to `transactions`
  - the negative-balance "stroke" handler is deleted; balances can't go negative any more.
- **Persistent cooldowns:** stored on the user doc as `cooldowns.<key>: Date` and claimed atomically. The claim is `findOneAndUpdate` with `cooldowns.key < now`, so a double-click or a restart can't double-claim.
- **Interaction framework:** a `defineCommand` / `defineComponent` wrapper does the following for every handler:
  - auto-creates the profile silently
  - `deferReply`s when the handler is marked `defer`
  - checks the component's owner id, which is encoded in the `customId`, and answers others with an ephemeral "this isn't yours"
  - catches errors and replies ephemerally, logging to `ERROR_LOG_CHANNEL_ID`
  - applies jail and permission guards
- **Collectors** always disable their components on end; shared via `lib/components.ts`.
- **RNG** goes through `lib/rng.ts`, which can be seeded in tests, so loot, odds and blackjack are testable.
- **Amount parser** (`lib/amount.ts`): `all`, `half`, `1k`, `2.5m`, `10%`, validated server-side against the real balance inside the atomic update.
- **Transactions need a replica set:** Atlas already is one. `docker-compose` Mongo will run as a single-node replica set, and tests use `mongodb-memory-server` in replset mode.

## 2. Folder layout

```
bot/
  src/
    index.ts                 client, intents, login, Mongo connect (fail fast)
    deploy-commands.ts       --guild <id> (dev, instant) | --global (prod)
    config/env.ts            zod-validated env
    content/                 items, rarities, jobs, minigames, ores, fish, hunt, dig,
                             crates, pets, quests, achievements, shop, gambling, business,
                             bosses, levels, prestige, balance (all tunable numbers)
    models/                  User, MemberLevel, Guild, Transaction, ShopRotation, Raid,
                             CommunityGoal, Season, SeasonScore, Warning, RolePanel,
                             Ticket, Afk
    services/                economy, inventory, cooldowns, accountXp, chatXp, achievements,
                             quests, crates, pets, business, gambling, shop, raids, drops,
                             seasons, leaderboard, modlog
    commands/
      economy/  work, mine, fish, hunt, dig, beg, search, crime, balance, bank (deposit/withdraw),
                daily, weekly, streak, inventory, use, sell, iteminfo, shop, buy, crate,
                business, give, gift, trade, cosmetics, fishdex
      gambling/ blackjack, slots, coinflip, highlow, roulette, crash
      social/   rob, heist, duel, pet
      levels/   rank, profile, levels (admin), achievements, prestige, leaderboard, season
      events/   attack (raid), goal, quests, remind
      music/    play, queue, nowplaying, skip, stop, pause, resume, volume, loop, shuffle,
                seek, jump, restart, join, leave
      mod/      ban, kick, timeout, purge, warn, warnings, settings
      utility/  help, ping, avatar, serverinfo, userinfo, afk, poll, rolepanel, ticket
      owner/    eco
    components/              button/select/modal handlers keyed by customId prefix
    events/                  ready, interactionCreate, messageCreate (chat XP, drops, AFK,
                             automod), voiceStateUpdate (voice XP), guildMemberAdd
    scheduler/               jobs: business payouts, manager auto-collect, daily/weekly
                             reset, shop rotation, drops tick, raid spawn/expiry, season end,
                             DM reminders, boost expiry
    lib/                     embeds (palette per category), format, amount, rng, canvas
                             (rank/profile/welcome/level-up cards), components, paginate,
                             minigames
    music/                   lavalink manager + player panel
  scripts/migrate-v2-to-v3.ts
  tests/                     vitest: economy service (in-memory replset), payout math, XP
                             curves, loot rolls, blackjack, quest progress, amount parser,
                             migration mapping
  lavalink/application.yml   (kept)
  Dockerfile, docker-compose.yml, .env.example, README.md, BALANCE.md
```

The old `commands/`, `events/`, `handlers/`, `functions/`, `models/`, `utils.js` and `config.json` get deleted once the matching phase replaces them. `ascii-table` and `ms` go too.

## 3. Data models

**User** (global, `_id` = Discord user id)

```
wallet, bank, bankCap                (base from level + bank notes)
account: { xp, level, prestige }     (0–10)
streak: { count, lastDaily, lastWeekly, best }
jailUntil, lastActiveAt, createdAt
cooldowns: { [key]: Date }
inventory: { [itemId]: qty }         (atomic $inc with $gte guards)
tools: { pickaxe|rod|shovel|rifle: { itemId, durability } }
job: { id, shifts, rank }
businesses: [{ id, level, workers, manager, upkeepDue, pending, lastTick }]
pet: { species, name, level, xp, happiness, lastFed, lastPlayed } | null
boosts: [{ kind: xp|coin|luck, mult, expiresAt }]
padlocks, guardDog                   (derived from items/pet; not stored twice)
quests: { daily: {day, list[{id, target, progress, claimed}], rerolled, bonusClaimed},
          weekly: {...} }
collections: { fishdex: { [speciesId]: { caught, biggest } } }
achievements: { [id]: Date }
cosmetics: { owned: [ids], equipped: { title, background, theme, badge } }
stats: { fishCaught, mined, worked, crimes, robsWon, robsLost, heists,
         gambling: { wagered, won, lost, biggestWin, byGame } }
settings: { dmReminders }
migratedFromV2: bool
```

**Other models**

| Model | Fields | Notes |
|---|---|---|
| MemberLevel (per server) | `{ guildId, userId, xp, level, messages, voiceMinutes, lastXpAt }` | unique index `guildId+userId` |
| Guild | `levels { announce: channel/same/dm/off, channelId, rewards[{level, roleId}], stackRewards, noXpChannels[], multipliers[{targetId, mult}], voiceXp, doubleXpUntil }`, `drops { enabled, channelIds[], perHour }`, `welcome { channelId, card }`, `modLogChannelId`, `automod { inviteFilter }`, `autoRoleId`, `tickets { panelChannelId, staffRoleId, counter, mode: thread/channel }` | |
| Transaction | `{ userId, delta, field: wallet/bank/item, itemId?, source, meta, at }` | indexed by user and time; feeds `/eco stats` |
| ShopRotation | `{ day, stock[{ itemId, price, remaining }] }` | |
| Raid | `{ guildId, bossId, hp, maxHp, damage { userId: n }, endsAt, status }` | |
| CommunityGoal | `{ guildId, metric, target, progress, contributors, endsAt, rewarded }` | |
| Season / SeasonScore | `{ number, startsAt, endsAt }` / `{ season, userId, points }` | |
| Warning | `{ guildId, userId, modId, reason, at }` | |
| RolePanel | `{ guildId, channelId, messageId, style: buttons/select, roles[{ roleId, label, emoji }] }` | |
| Ticket | `{ guildId, threadId, ownerId, number, status, closedAt }` | |
| Afk | as today | |

Trade, duel, heist lobbies and crash rounds are short-lived, so they live in memory. Their final settlement is one DB transaction, so a restart mid-trade loses nothing.

## 4. Feature notes and decisions

- **Account level (global)** vs **chat level (per server)**:
  - always labelled "Account Lv" and "Server Lv"
  - separate curves in `content/levels.ts`
  - the account level gates content: jobs, tools, crime, heist, gambling caps.
- **Chat XP:**
  - 15–25 XP per message, 60s per user
  - ignores bots, messages under 5 characters and command invocations
  - voice XP is 10/min when the user is not alone, muted or deafened
  - multipliers per channel/role, plus double-XP weekends.
  - **Needs the privileged Message Content intent** (to measure message length). The bot already uses it, but if the real bot is in 100+ servers, the intent must stay approved in the developer portal.
- **Bank capacity** = base + per-level growth + bank notes. Wallet is robbable, bank is safe.
- **Work minigames:** unscramble (modal), quick maths (buttons), emoji memory (buttons), colour click. All are pure functions in `lib/minigames.ts`, so they're testable.
- **Gambling:**
  - Each game is a pure state machine (`services/gambling/*`) plus a thin renderer.
  - The house edge, min bet and level-scaled max bet live in `content/gambling.ts`.
  - Crash uses a precomputed crash point from a seeded RNG and is settled atomically.
- **Rob:**
  - Requirements: the target was active in the last 24h, the robber holds a minimum wallet, and success odds depend on the level difference and items.
  - **Counterplay:** a padlock is consumed to block a rob, a guard-dog pet lowers the odds, and the victim gets a 30s "🚨 Catch them!" button.
  - Failure means a fine, which can also land the robber in jail.
- **Polls:** Discord's native poll API.
- **Tickets:** private threads by default, with a channel mode option. Close and Transcript buttons; the transcript is a `.txt` attachment posted to the mod log.
- **Roles:** button/select role panels replace emoji reaction roles. Autorole is kept.
- **Music:**
  - Same Lavalink setup, as slash commands.
  - A now-playing panel with ⏯ ⏭ 🔁 🔀 ⏹ buttons is updated on track change, plus a paginated queue.
  - The YouTube plugin snapshot and OAuth setup stay as-is.
- **Images (`@napi-rs/canvas`):**
  - rank card, profile card (badges, title, prestige), level-up card, welcome card
  - streak calendar, crate reveal and fishdex grid
  - Cards are cached per user for 60s to avoid re-rendering on spam.

## 5. Phase checklist

Each phase ends with `tsc --noEmit`, `vitest run`, a boot test against Discord, a commit, and a short summary to you.

- [x] **1. Foundation:**
  - TS strict project (tsx dev, tsc build), zod env, Mongo connect (fail fast), command/component/modal router, deploy script (guild/global)
  - embed palette, formatting, amount parser, RNG, models
  - economy service with atomic ops and transaction log, cooldown service, scheduler skeleton, error logging channel
  - Vitest with in-memory replset: economy service tests (concurrency included), amount parser tests.
- [x] **2. Core economy** (split: **2a done** — balance/bank, daily/weekly/streaks, work + jobs + minigames, mine, fish + fishdex, tools, beg, search; **2b done** — hunt, dig, crime/jail/bail, items/inventory, shop rotation, sell, use, crates, consumables, titles and themes. Padlocks and the guard dog move to Phase 4 with /rob; profile backgrounds to Phase 3 with profile cards):
  - balance, bank (capacity), daily/weekly/streaks and streak calendar
  - work with jobs and 4 minigames, mine (tunnels, durability, gems), fish (reel timing, fishdex), hunt, dig
  - beg, search, crime/jail; item system, inventory (paginated with filter), use, sell (incl. by rarity), iteminfo
  - shop with daily rotation, buy, crates with reveal animation, consumables, cosmetics.
- [x] **UX pass (between 2b and 3):** /menu hub with First steps, one Shop (tools inside), Inventory with item screens, sell confirmations, item locks, Wardrobe, Balance with amount boxes, Jobs, Fishdex, Help, Jail; breadcrumb titles and next-step rows on every activity. Menu screens are pure functions of (path, profile) with the path in the button ID; a crawler test checks every reachable screen against Discord limits and the menu rules.
- [x] **Icon pass:** Tabler icon set as application emojis (`scripts/icons/*`, `src/content/icons.ts`), three colour versions: brand blue for screen titles, white on green/blue buttons, grey inline; rarity and veteran badges in fixed colours. Embed side colour is the brand #6066AE everywhere except success/warning/error results. Contact sheet: `docs/icons-sheet.png`.
- [ ] **Veteran set** (see §9): cosmetics, badges, badge slot and rank card frames done; awarding and the welcome-back message in Phase 7.
- [x] **3. Levels** (built: `/rank`, `/profile`, `/achievements`, `/prestige`, `/levels` admin; chat XP with a 60s DB-guarded cooldown, voice XP job, reward roles, announcements with a level-up card; cards in `lib/cards.ts` with bundled OFL fonts; 49 achievements (7 hidden); prestige to level 35 with tokens, 5 perks and prestige cosmetics; unlocks use the best-ever level so prestige never re-locks or re-pays crates; card backgrounds in the shop. Server leaderboards stay in Phase 5.) (includes crime achievements and titles: e.g. *Light Fingers* for 50 pickpockets, *Master Hacker* for 25 ATM hacks, *Art Thief* for stealing The Mona Octa, *Repeat Offender* for 25 arrests — stats are already tracked in `stats.crimeWins`, `stats.crimeLoot`, `stats.crimesFailed`)
  - chat and voice XP, level rewards, announcements and level-up card, rank card, profile card
  - account levels and unlocks, prestige 0–10 with badges and a prestige shop
  - 40+ achievements, some hidden.
  - Veteran rank card frames/backgrounds (one per tier); badge and title on rank cards, leaderboards and level-up messages.
- [x] **4. Gambling + social** (built: coinflip, slots, blackjack, high-low, roulette, crash with tested house edges and a ₪2.5M per-round cap; /casino; /settings gambling; rob with padlock, guard dog and a 30s escrowed getaway the victim can catch; NPC-vault heist lobby; reaction duel; trade window; give (5% tax) and gift; coins in trades and duel pots taxed like give):
  - blackjack, slots, coinflip, high-low, roulette, crash, gambling stats
  - rob with counterplay, multiplayer heist lobby, duel, trade window, give (tax), gift.
- [x] **5. Retention & events** (**5b done**: chat drops, weekly boss raids and community goals, pets, business, monthly seasons with a season board and rewards; Achievements/Leaderboards/Season/Prestige grouped under Progress in the menu; **5a done**: daily/weekly quests with rerolls and bonus chests, opt-in DM reminders, leaderboards with the brief's six boards plus fishdex and achievements; **5b next**: drops, raids, community goals, pets, business, seasons):
  - daily/weekly quests (reroll, bonus chest), DM reminders
  - random drops, weekly boss raids, community goals, pets, business expansion (manager auto-collect, events, offline cap)
  - seasons and leaderboards (6 metrics, server/global, paginated).
- [ ] **6. Utility port:**
  - music as slash commands with a control panel
  - ban, kick, timeout, purge, warn/warnings and mod log, invite filter automod
  - role panels, autorole, thread tickets with transcripts, welcome (card)
  - afk, avatar, serverinfo, userinfo, ping, poll, interactive help, `/settings` dashboard.
- [ ] **7. Polish:**
  - `migrate-v2-to-v3.ts` (idempotent, `--dry-run`, summary), `/eco` owner tools and `/eco stats`
  - Veteran tiers awarded by the migration (counts in the dry-run summary); one-time welcome-back message on a veteran's first v3 command
  - Remove `ANTI_ALT_*` overrides from the production `.env` (the real bot logs an error at startup if they weaken the defaults)
  - The migration sets `account.best` to the migrated level (unlocks and level achievements read it)
  - Check the real bot's privileged intents (Message Content, Server Members) in the developer portal; the bot falls back safely if they're off, but chat XP is better with Message Content
  - `/eco stats` shows **coins created vs destroyed per day** (from the Transaction log: creation sources like activities, quests, drops and payouts, vs destruction like repairs, purchases, taxes, the casino edge and prestige wipes), net inflation, and the money supply over time, so real inflation can be watched after launch
  - BALANCE.md and README
  - Docker update (replset Mongo, build step), `.env.example`
  - full test pass, live run and fixes.

## 6. Migration mapping (`scripts/migrate-v2-to-v3.ts`)

| Old | New |
|---|---|
| `coins` | `wallet` (clamped, see below) |
| `bank` | `bank`, clamped to the new capacity; overflow goes to `wallet` |
| `level` / `xp` | `account.level` / `account.xp` (re-fit to the new curve, never lowered) |
| `prestige`, `streak`, `lastDaily` | same |
| `Mine.toolTier` | owned pickaxe item at full durability |
| `Items.*Fish`, `FishingRod`, `Cookies`, `Shirt`, `Pants` | inventory items (fish map to the new species by rarity; Shirt/Pants/Cookies become collectibles) |
| `Company.workers` / `hasManager` / pending wages | one starter business with equivalent workers and manager; pending wages paid out once |
| guild `welcomeID`, `autoRoleID`, `InviteLinks`, `ticket.*` | new guild settings |
| old `autoroles` collection | `autoRoleId` |

The script never deletes old collections. Each user doc is marked `migratedFromV2`, so re-running the script skips users already converted. `--dry-run` prints the full summary without writing.

**Up front vs on demand (approved 2026-11-24).** Only profiles with real activity are migrated up front: the same rule as the Veteran tier (§9), **445 of 77,801** old profiles (444 from 2021–22, 1 from the April 2026 relaunch; read-only count from the live data). The other ~77,356 (most never ran a tracked command) are left in `profilemodels` and imported **on demand**. The import runs inside **every** profile-creation path (`ensureUser`, `loadProfile`, `loadProfileDetailed`), not just a player's own first command, so looking someone up (`/balance @x`, `/profile @x`) or paying them can't create a blank v3 profile ahead of their import. The import and the creation are one atomic upsert built from the old document (marked `migratedFromV2`), so a race can't import twice or lose coins sent to them. Veteran tiers are computed over all 77,801 old profiles, so nobody who qualifies is missed; anyone imported on demand didn't meet the activity rule and gets no tier. After import: `account.best` is set, and board values are refreshed immediately (not left for the next startup). `createdAt` is backdated to the old profile's creation time **only for the 445 active profiles**; on-demand imports keep `createdAt = now`, so dormant old accounts can't skip the 3-day anti-alt rule.

## 7. Decisions (approved)

1. **Corrupt balances:** wallet, bank, items and workers are capped at a ceiling derived from the late-game numbers in BALANCE.md (not a fixed number). Veteran tiers are based on old activity, never balance (see §9).
2. **Old reaction roles** keep working through a legacy listener; admins get a one-time nudge to move to `/rolepanel`.
3. **Prefix notice** for 30 days after launch, at most once per channel per hour.
4. **Gambling** has a per-server toggle, on by default.
5. **Seasons** are monthly; Season 1 starts 2 weeks after launch.
6. **Process:** work on the `v3` branch; never write to the live database during development (enforced in code — see `config/env.ts`); take a `mongodump` backup before any migration; run the migration with `--dry-run` against a copy first and show the summary.
7. **Message Content intent:** if it isn't available, chat XP falls back to cooldown-only (no message-length check).

## 8. Original questions

1. **Corrupt balances.** About ₪1.5 × 10⁵⁷ can't be kept. Options:
   - (a) clamp any wallet/bank above a sane ceiling (e.g. ₪10M) down to that ceiling
   - (b) reset everyone's coins for a fresh 3.0 economy, keeping items, levels and streaks
   - (c) clamp, and also give long-time players a "Veteran" badge so nobody feels robbed.

   My recommendation is **(c)**.
2. **Old emoji reaction roles** (50 entries in `reactionroles`, live in servers). Slash-only and role panels replace them. Options:
   - (a) keep a small legacy listener so existing reaction-role messages keep working
   - (b) drop them, so server admins rebuild with `/rolepanel`.

   My recommendation is **(a)** until admins migrate.
3. **Slash commands vs the prefix:** dropping `!` means people type `/`. Do you want a temporary `!` reply saying "OctBot now uses slash commands, try `/help`"? I'd recommend yes, for about a month.
4. **Gambling availability:** the brief says in-game currency only, which is how I'll build it. Do you also want an admin toggle to disable gambling per server (some servers dislike it)? I'd recommend yes.
5. **Season length:** monthly, as the brief suggests?

Nothing gets cut from the brief. If something turns out not to be workable, I'll tell you rather than stubbing it.

## 9. Veteran set (players from the original bot)

Thresholds proposed from a read-only look at the live data (77,801 profiles; 76,671 never ran a tracked command). The old bot's `level` field barely moved (only 382 profiles above 0, max level 3) and nobody prestiged, so tiers use **distinct commands used** (`commands_cooldowns`) and join date instead. **Approved 2026-11-23.**

| Tier | Rule | Count |
|---|---|---|
| **Veteran** | 2021–22 profile with ≥2 distinct commands, or non-default items, company workers, or a claimed top.gg vote; 2026 profiles with XP/mining/items | **445** (18 of them corrupt) |
| **Elite Veteran** | 2021–22, ≥8 distinct commands, not corrupt | **64** |
| **Founder** | joined before 2021-06-01, ≥5 distinct commands, not corrupt | **23** |

Corrupt = wallet or bank above ₪15.4M or negative; those players get base Veteran only.

Each tier includes the ones below it:

| Tier | Title | Badge (Tabler) | Theme |
|---|---|---|---|
| Veteran | Veteran | shield | Classic Oct #6B32A8 |
| Elite Veteran | Elite Veteran | shield-star | Elite Amethyst #8E44AD |
| Founder | Founder | crown, gold #AF810E (3.5:1 on both themes) | Founder Gold #AF810E |

Rules: never sold or tradable, never earnable after launch (`exclusive: 'veteran'` in `content/cosmetics.ts`; the shop and `/buy` skip them). The badge shows before your name on `/balance`, rank cards, leaderboards and level-up messages; players can hide it in the Wardrobe. Granted by `services/veteran.ts` during the migration only. Welcome-back message (once, on the first v3 command): thanks them, shows their tier and unlocks, with an **Equip now** button to the Wardrobe.


## 10. Phase 8: Premium (future, not built; owner chooses A or B later)

**One check everywhere:** `src/services/premium.ts` exports `isPremium(user)` and `isPremiumServer(server)`, both always `false` today. Every perk below must be gated only through these, so switching premium on (Discord Premium Apps entitlements, read from the interaction) is one change in that file plus the perks.

### Option A: cosmetic and convenience VIP (no income advantage)

- **Player VIP:** VIP badge and name colour on cards and leaderboards, an exclusive cosmetic each month, animated card backgrounds, +1 quest reroll per set, bigger inventory (if limits are added), more reminder options (several hours, quest-ready alerts), early access to new features.
- **Server VIP:** 24/7 music, saved playlists, audio filters, more level-reward roles (e.g. 25 → 50), custom drop chests (admin-picked names and art; rewards stay the same).

**Balance impact:** none on coins or XP. The extra reroll lets a VIP swap an awkward quest for one they'd finish anyway, so it lets them finish slightly more quests: at most one more quest a day (≈ ₪250–2,900 by level), under 1% of income.

| Stage | Free ₪/active hour | VIP (A) ₪/active hour |
|---|---|---|
| New | ₪15,187 | ₪15,187 |
| Early (lv 5) | ₪29,778 | ₪29,778 |
| Mid (lv 15) | ₪59,165 | ₪59,165 |
| Late (lv 35) | ₪109,959 | ₪109,959 |

### Option B: Option A plus small boosts

- **Boosts:** at most **+15% account XP** and **+10% coins from activities** (work, mine, fish, hunt, dig, beg, search, crime). Never crate odds, drop odds, loot rarity or any gambling chance.
- **Rankings:** boosted earnings are excluded from seasonal points (already counted per activity, not per coin) and from the net worth / rich-list board. That means tracking `boostedEarnings` separately and subtracting it from `board.netWorth`.
- **Casino:** boosts never touch gambling. Either bets can't use boosted coins (needs a separate "boosted" balance, complex), or the casino simply has no premium effects and the per-round cap stays the same. **Recommended:** the second, simpler choice: VIP boosts never apply to gambling payouts, and the casino rules and edges are identical for everyone.

**Balance impact (from the balance model, net coins per active hour):**

| Stage | Free | VIP (B, +10% coins) | XP/hour free → VIP |
|---|---|---|---|
| New | ₪15,187 | ₪16,705 | 801 → 921 |
| Early (lv 5) | ₪29,778 | ₪32,756 | 1,029 → 1,183 |
| Mid (lv 15) | ₪59,165 | ₪65,081 | 1,029 → 1,183 |
| Late (lv 35) | ₪109,959 | ₪120,955 | 1,029 → 1,183 |

Level 35 (first prestige) takes **65 h free vs ~57 h VIP**. The +10% stacks with prestige, Golden Touch, the parrot and coin boosts, so the multiplier cap tests need a premium case, and late-game sinks (tool wear 10–15%) should be rechecked.

### Risks (both options)

- **Discord Premium Apps eligibility:** the developer must be **18+**, in a **supported country**, with a verified team and payout account; the app must follow Discord's monetization terms (no gambling with real-money value, no selling Discord-wide perks). Check the current eligibility list before choosing.
- **Under-18 audience:** OctBot's players skew young. Paid perks must be clearly priced, never pushed in DMs, and not tied to time-limited pressure. Purchases happen in Discord's own flow, which handles parental controls, but the bot shouldn't advertise in kids' servers.
- **Gambling and loot boxes:** coins have no real-money value and can't be bought or cashed out. Keep it that way. Premium must never buy coins, crates, crate odds, drop odds or casino chances. Option B's coin boost feeds the casino indirectly; excluding boosts from gambling (above) keeps "paying" and "gambling" apart. Several countries (e.g. Belgium, the Netherlands) treat paid randomised rewards as gambling, which is another reason crates stay out of premium entirely.
- **Fairness:** Option A is fair by design (cosmetics and convenience only). Option B is pay-to-progress at a small scale; mitigated by keeping VIP out of seasonal and net-worth rankings, capping the boost at +10% coins and +15% XP, and keeping prestige, achievements and Veteran items earnable only by playing. Expect some players to see any boost as pay-to-win.
- **Server VIP:** 24/7 music raises hosting and Lavalink load, so price for it. Custom drop chests must stay cosmetic (same reward table) to avoid server owners selling "better drops".

## 11. Aspirational sinks for rich players (Phase 5 polish or right after launch; not built)

**Why:** at level 35 the only big sinks are tool wear (~10% of gross) and the prestige wipe. Everything else (pet food, taxes, casino edge, cosmetics) is about 4% combined (BALANCE.md, "Combined daily income"). **Target:** non-prestige sinks remove **~15%** of a level-35 player's gross income (~₪41k/day of ~₪272k), so ~₪14k/day more than now.

- **Luxury cosmetics (₪500k–5M):** prestige-looking titles, themes and **animated card backgrounds** (rendered as short animated images; needs a GIF/APNG card path), plus a **limited monthly item** (sold for one month only, never again; shows the month on the profile).
- **Status collectibles on the profile card:** a house, car, yacht, trophy shelf, aquarium (fishdex-themed): a "collection" row on `/profile`, each piece with tiers (₪250k → ₪5M). Pure status; no income effect, so it doesn't feed back into the economy.
- **Pet accessories and evolutions:** collars, hats and beds (cosmetic, shown on `/pet` and the profile card), and an **evolution** at pet level 10 (expensive, cosmetic form change; the perk stays the same so it isn't pay-to-win).
- **Server contributions:** donate coins to this week's **raid pot** (adds to the reward pool for everyone who fights) or **community goal** (adds a bonus to the goal reward). Donors get a "Patron" badge for the week and the server gets a small, capped, server-wide perk (e.g. +5% drop chance in that server for a day). Donations are destroyed (or capped below their value when paid back out) so the net effect is still a sink, and they count toward the weekly giving limit so they can't launder coins between alts.

**How to check the target:** add each sink to `scripts/income-report.ts` with a "rich player" assumption (e.g. one luxury item a month, one collectible tier every two weeks, a weekly donation) and a test that non-prestige sinks are 12–18% of level-35 gross.

# OctBot 3.0 — Plan

Status: **approved** — building on the `v3` branch. Phase 1 done.

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
- [ ] **2. Core economy:**
  - balance, bank (capacity), daily/weekly/streaks and streak calendar
  - work with jobs and 4 minigames, mine (tunnels, durability, gems), fish (reel timing, fishdex), hunt, dig
  - beg, search, crime/jail; item system, inventory (paginated with filter), use, sell (incl. by rarity), iteminfo
  - shop with daily rotation, buy, crates with reveal animation, consumables, cosmetics.
- [ ] **3. Levels:**
  - chat and voice XP, level rewards, announcements and level-up card, rank card, profile card
  - account levels and unlocks, prestige 0–10 with badges and a prestige shop
  - 40+ achievements, some hidden.
- [ ] **4. Gambling + social:**
  - blackjack, slots, coinflip, high-low, roulette, crash, gambling stats
  - rob with counterplay, multiplayer heist lobby, duel, trade window, give (tax), gift.
- [ ] **5. Retention & events:**
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

## 7. Decisions (approved)

1. **Corrupt balances:** wallet, bank, items and workers are capped at a ceiling derived from the late-game numbers in BALANCE.md (not a fixed number). The **Veteran** badge goes to old accounts by account age or old level, never by balance.
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

import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { economyConfig } from '../content/economy';

/** One global profile per Discord user. Stored in `players` so it never collides with v2's `profilemodels`. */
const userSchema = new Schema(
  {
    _id: { type: String, required: true }, // Discord user id
    wallet: { type: Number, default: economyConfig.startingWallet, min: 0 },
    bank: { type: Number, default: 0, min: 0 },
    bankNotes: { type: Number, default: 0, min: 0 },

    account: {
      xp: { type: Number, default: 0, min: 0 },
      level: { type: Number, default: 0, min: 0 },
      prestige: { type: Number, default: 0, min: 0 },
      /** Highest level ever reached. Unlocks use this, so prestiging never re-locks anything. */
      best: { type: Number, default: 0, min: 0 },
    },

    /** Prestige tokens and the perks bought with them (content/prestige.ts). */
    prestige: {
      tokens: { type: Number, default: 0, min: 0 },
      perks: { type: [String], default: [] },
    },

    /** achievement id → when it was unlocked */
    achievements: { type: Map, of: Date, default: () => new Map() },

    /** itemId → quantity */
    inventory: { type: Map, of: Number, default: () => new Map() },
    /** cooldown key → time it expires */
    cooldowns: { type: Map, of: Date, default: () => new Map() },

    /** Equipped tools. A tool at 0 durability is broken until repaired. */
    tools: {
      pickaxe: { id: { type: String, default: null }, durability: { type: Number, default: 0 } },
      rod: { id: { type: String, default: null }, durability: { type: Number, default: 0 } },
      weapon: { id: { type: String, default: null }, durability: { type: Number, default: 0 } },
      shovel: { id: { type: String, default: null }, durability: { type: Number, default: 0 } },
    },

    /** When each active boost runs out. */
    boosts: {
      xp: { type: Date, default: null },
      coin: { type: Date, default: null },
      luck: { type: Date, default: null },
      /** Guard dog protection (see content/social.ts). */
      guard: { type: Date, default: null },
    },

    cosmetics: {
      owned: { type: [String], default: [] },
      title: { type: String, default: null },
      theme: { type: String, default: null },
      /** Equipped badge, shown next to your name. null hides it. */
      badge: { type: String, default: null },
      /** Rank/profile card background and avatar frame. */
      background: { type: String, default: null },
      frame: { type: String, default: null },
    },

    /** Players from the original bot (set by the v2 migration). */
    veteran: {
      tier: { type: String, enum: ['veteran', 'elite', 'founder', null], default: null },
      /** The one-time welcome-back message has been shown. */
      welcomed: { type: Boolean, default: false },
    },

    /** Daily and weekly quests (content/quests.ts). `base` is the stat value when handed out. */
    quests: {
      daily: {
        day: { type: Number, default: -1 },
        list: [{ id: String, target: Number, base: Number, claimed: { type: Boolean, default: false }, _id: false }],
        rerolls: { type: Number, default: 0 },
        bonusClaimed: { type: Boolean, default: false },
      },
      weekly: {
        week: { type: Number, default: -1 },
        list: [{ id: String, target: Number, base: Number, claimed: { type: Boolean, default: false }, _id: false }],
        rerolls: { type: Number, default: 0 },
        bonusClaimed: { type: Boolean, default: false },
      },
    },

    /** When DM reminders were last sent (UTC day / week numbers). */
    reminders: {
      dailyDay: { type: Number, default: -1 },
      weeklyWeek: { type: Number, default: -1 },
    },

    /** Leaderboard values, recomputed after every change (services/boardStats.ts). */
    board: {
      v: { type: Number, default: 0 },
      netWorth: { type: Number, default: 0 },
      level: { type: Number, default: 0 },
      fish: { type: Number, default: 0 },
      gambling: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      fishdex: { type: Number, default: 0 },
      achievements: { type: Number, default: 0 },
    },

    /** Coins and items sent to other players today (daily giving limit). */
    giving: {
      day: { type: Number, default: -1 },
      coins: { type: Number, default: 0 },
      items: { type: Number, default: 0 },
    },

    /** Daily-rotation purchases for the per-player limits; reset when the day changes. */
    rotation: {
      day: { type: Number, default: -1 },
      bought: { type: Map, of: Number, default: () => new Map() },
    },

    job: {
      current: { type: String, default: 'barista' },
      /** jobId → shifts worked in that job (keeps your rank if you switch back) */
      shifts: { type: Map, of: Number, default: () => new Map() },
    },

    streak: {
      count: { type: Number, default: 0 },
      best: { type: Number, default: 0 },
      lastDaily: { type: Date, default: null },
      /** Day numbers (days since epoch, UTC) of recent daily claims, newest last. */
      days: { type: [Number], default: [] },
      weeklyCount: { type: Number, default: 0 },
      lastWeekly: { type: Date, default: null },
    },

    /** speciesId → { caught, biggest kg } */
    fishdex: {
      type: Map,
      of: new Schema({ caught: { type: Number, default: 0 }, biggest: { type: Number, default: 0 } }, { _id: false }),
      default: () => new Map(),
    },

    /** Item ids the player locked; bulk sales never include them. */
    lockedItems: { type: [String], default: [] },

    /** The "First steps" checklist on the hub. */
    onboarding: {
      crateClaimed: { type: Boolean, default: false },
    },

    /** Fishdex completion rewards already claimed (percentages). */
    fishdexRewards: { type: [Number], default: [] },

    stats: {
      worked: { type: Number, default: 0 },
      perfectShifts: { type: Number, default: 0 },
      mined: { type: Number, default: 0 },
      caveIns: { type: Number, default: 0 },
      gemsFound: { type: Number, default: 0 },
      fishCaught: { type: Number, default: 0 },
      fishLost: { type: Number, default: 0 },
      begged: { type: Number, default: 0 },
      searched: { type: Number, default: 0 },
      hunted: { type: Number, default: 0 },
      missedHunts: { type: Number, default: 0 },
      digs: { type: Number, default: 0 },
      treasures: { type: Number, default: 0 },
      crimes: { type: Number, default: 0 },
      crimesFailed: { type: Number, default: 0 },
      /** crimeId → successful attempts (for Phase 3 crime achievements and titles) */
      crimeWins: { type: Map, of: Number, default: () => new Map() },
      crimeLoot: { type: Number, default: 0 },
      /** crime loot itemId → times found */
      crimeLootItems: { type: Map, of: Number, default: () => new Map() },
      /** Messages and voice minutes that earned server XP, across all servers. */
      messages: { type: Number, default: 0 },
      voiceMinutes: { type: Number, default: 0 },
      /** Coins earned from activities (for quests). */
      earned: { type: Number, default: 0 },
      fishSold: { type: Number, default: 0 },
      /** Last message that counted for stats.messages (one per minute across all servers). */
      lastMessageAt: { type: Date, default: null },
      questsDone: { type: Number, default: 0 },
      robsWon: { type: Number, default: 0 },
      robsFailed: { type: Number, default: 0 },
      robbedTimes: { type: Number, default: 0 },
      robbersCaught: { type: Number, default: 0 },
      heists: { type: Number, default: 0 },
      heistsWon: { type: Number, default: 0 },
      duelsWon: { type: Number, default: 0 },
      duelsLost: { type: Number, default: 0 },
      trades: { type: Number, default: 0 },
      gambling: {
        played: { type: Number, default: 0 },
        wagered: { type: Number, default: 0 },
        paidOut: { type: Number, default: 0 },
        /** Biggest net win in one round. */
        biggestWin: { type: Number, default: 0 },
        /** game → totals */
        byGame: {
          type: Map,
          of: new Schema({ played: { type: Number, default: 0 }, wagered: { type: Number, default: 0 }, paidOut: { type: Number, default: 0 } }, { _id: false }),
          default: () => new Map(),
        },
      },
      cratesOpened: { type: Number, default: 0 },
      itemsSold: { type: Number, default: 0 },
      streakFreezesUsed: { type: Number, default: 0 },
    },

    jailUntil: { type: Date, default: null },
    lastActiveAt: { type: Date, default: () => new Date() },

    settings: {
      dmReminders: { type: Boolean, default: false },
      /** UTC hour (0–23) to send reminders; null = the hour they usually claim their daily. */
      remindHour: { type: Number, default: null, min: 0, max: 23 },
    },

    migratedFromV2: { type: Boolean, default: false },
  },
  { collection: 'players', timestamps: true, versionKey: false },
);

// Leaderboards: top-N by each stored value, ties by id
for (const f of ['netWorth', 'level', 'fish', 'gambling', 'streak', 'fishdex', 'achievements']) userSchema.index({ [`board.${f}`]: -1, _id: 1 });

// Only players who opted in to DM reminders (the hourly job reads these)
userSchema.index({ 'settings.dmReminders': 1 }, { partialFilterExpression: { 'settings.dmReminders': true } });

export type UserData = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserData>;
export const User = model('User', userSchema);

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
    },

    /** itemId → quantity */
    inventory: { type: Map, of: Number, default: () => new Map() },
    /** cooldown key → time it expires */
    cooldowns: { type: Map, of: Date, default: () => new Map() },

    /** Equipped tools. A tool at 0 durability is broken until repaired. */
    tools: {
      pickaxe: { id: { type: String, default: null }, durability: { type: Number, default: 0 } },
      rod: { id: { type: String, default: null }, durability: { type: Number, default: 0 } },
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
    },

    jailUntil: { type: Date, default: null },
    lastActiveAt: { type: Date, default: () => new Date() },

    settings: {
      dmReminders: { type: Boolean, default: false },
    },

    migratedFromV2: { type: Boolean, default: false },
  },
  { collection: 'players', timestamps: true, versionKey: false },
);

export type UserData = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserData>;
export const User = model('User', userSchema);

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

import { Schema, model, type InferSchemaType } from 'mongoose';

/** Per-server settings, stored in `guild_settings` (v2's `guilds` collection is left untouched). */
const guildSettingsSchema = new Schema(
  {
    _id: { type: String, required: true }, // Discord guild id

    levels: {
      /** Where level-up messages go. */
      announce: { type: String, enum: ['same', 'channel', 'dm', 'off'], default: 'same' },
      channelId: { type: String, default: null },
      rewards: [{ level: { type: Number, required: true }, roleId: { type: String, required: true }, _id: false }],
      /** Keep earlier reward roles when a new one is earned. */
      stackRewards: { type: Boolean, default: true },
      noXpChannelIds: { type: [String], default: [] },
      multipliers: [{ targetId: { type: String, required: true }, mult: { type: Number, required: true }, _id: false }],
      voiceXp: { type: Boolean, default: true },
      doubleXpUntil: { type: Date, default: null },
    },

    drops: {
      enabled: { type: Boolean, default: false },
      channelIds: { type: [String], default: [] },
      perHour: { type: Number, default: 2 },
    },

    welcome: {
      channelId: { type: String, default: null },
      card: { type: Boolean, default: true },
    },

    modLogChannelId: { type: String, default: null },
    automod: {
      inviteFilter: { type: Boolean, default: false },
    },
    autoRoleId: { type: String, default: null },

    tickets: {
      panelChannelId: { type: String, default: null },
      staffRoleId: { type: String, default: null },
      counter: { type: Number, default: 0 },
      mode: { type: String, enum: ['thread', 'channel'], default: 'thread' },
    },

    gamblingEnabled: { type: Boolean, default: true },

    /** One-time notice to admins about moving old reaction roles to /rolepanel. */
    legacyReactionRoleNoticeSent: { type: Boolean, default: false },
  },
  { collection: 'guild_settings', timestamps: true, versionKey: false },
);

export type GuildSettingsData = InferSchemaType<typeof guildSettingsSchema>;
export const GuildSettings = model('GuildSettings', guildSettingsSchema);

/** Settings for a guild, created with defaults on first use. */
export async function getGuildSettings(guildId: string) {
  return GuildSettings.findOneAndUpdate(
    { _id: guildId },
    { $setOnInsert: { _id: guildId } },
    { upsert: true, new: true, lean: true },
  );
}

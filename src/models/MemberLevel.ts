import { Schema, model, type InferSchemaType } from 'mongoose';

/** Server (chat) level for one member of one server. */
const memberLevelSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 0, min: 0 },
    messages: { type: Number, default: 0 },
    voiceMinutes: { type: Number, default: 0 },
    /** Last message that earned XP (the 60s cooldown). */
    lastXpAt: { type: Date, default: null },
  },
  { collection: 'member_levels', timestamps: true, versionKey: false },
);
memberLevelSchema.index({ guildId: 1, userId: 1 }, { unique: true });
// Rank position: count members in the server with more XP
memberLevelSchema.index({ guildId: 1, xp: -1 });

export type MemberLevelData = InferSchemaType<typeof memberLevelSchema>;
export const MemberLevel = model('MemberLevel', memberLevelSchema);

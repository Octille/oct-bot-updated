import { Schema, model } from 'mongoose';

/** Someone who is away in a server (/afk). Cleared when they next talk there. */
const afkSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    reason: { type: String, default: null, maxlength: 200 },
    since: { type: Date, required: true },
  },
  { collection: 'afk', versionKey: false },
);
afkSchema.index({ guildId: 1, userId: 1 }, { unique: true });
export const Afk = model('Afk', afkSchema);

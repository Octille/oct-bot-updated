import { Schema, model } from 'mongoose';

/** A warning (and the case number it got in that server). */
const warningSchema = new Schema(
  {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    modId: { type: String, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    case: { type: Number, required: true },
  },
  { collection: 'warnings', timestamps: true, versionKey: false },
);
warningSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
warningSchema.index({ guildId: 1, case: 1 }, { unique: true });
export const Warning = model('Warning', warningSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

/** A button or select-menu role panel (replaces v2's emoji reaction roles). */
const rolePanelSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 1000 },
    style: { type: String, enum: ['buttons', 'select'], default: 'buttons' },
    roles: [{ roleId: { type: String, required: true }, label: { type: String, default: null }, emoji: { type: String, default: null }, _id: false }],
  },
  { collection: 'role_panels', timestamps: true, versionKey: false },
);
rolePanelSchema.index({ guildId: 1 });

export type RolePanelData = InferSchemaType<typeof rolePanelSchema> & { _id: unknown };
export const RolePanel = model('RolePanel', rolePanelSchema);

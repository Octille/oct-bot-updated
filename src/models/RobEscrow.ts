import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A successful robbery's loot, held for the getaway window. The victim can catch the robber
 * until `deadline`; after that it's paid to the robber (by a timer, a startup sweep, or the
 * per-minute job). The status flips exactly once.
 */
const robEscrowSchema = new Schema(
  {
    robberId: { type: String, required: true },
    victimId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'paid', 'caught'], default: 'pending' },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null },
  },
  { collection: 'rob_escrows', timestamps: true, versionKey: false },
);
robEscrowSchema.index({ status: 1, deadline: 1 });

export type RobEscrowData = InferSchemaType<typeof robEscrowSchema> & { _id: unknown };
export const RobEscrow = model('RobEscrow', robEscrowSchema);

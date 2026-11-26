import { Schema, model } from 'mongoose';

/** A support ticket: a private thread (default) or a private channel. */
const ticketSchema = new Schema(
  {
    guildId: { type: String, required: true },
    ownerId: { type: String, required: true },
    number: { type: Number, required: true },
    /** The thread or channel; null for the moment between claiming the ticket and creating it. */
    channelId: { type: String, default: null },
    mode: { type: String, enum: ['thread', 'channel'], required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
  },
  { collection: 'tickets', timestamps: true, versionKey: false },
);
// One open ticket per member per server (also stops double-clicks opening two)
ticketSchema.index({ guildId: 1, ownerId: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
ticketSchema.index({ guildId: 1, channelId: 1 });
export const Ticket = model('Ticket', ticketSchema);

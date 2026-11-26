import { Schema, model } from 'mongoose';

/** Coins in circulation at the start of each UTC day (written by the scheduler), for /eco stats. */
const economySnapshotSchema = new Schema(
  {
    _id: { type: Number, required: true }, // UTC day number (days since epoch)
    wallet: { type: Number, required: true },
    bank: { type: Number, required: true },
    players: { type: Number, required: true },
    at: { type: Date, default: () => new Date() },
  },
  { collection: 'economy_snapshots', versionKey: false },
);

export const EconomySnapshot = model('EconomySnapshot', economySnapshotSchema);

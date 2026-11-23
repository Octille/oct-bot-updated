import { Schema, model } from 'mongoose';

/**
 * A round whose stakes have been taken but not yet settled (a game, duel or heist in progress).
 * Created in the same transaction as the stakes and deleted in the same transaction as the payout,
 * so anything left at startup was interrupted by a restart and gets refunded.
 */
const activeRoundSchema = new Schema(
  {
    kind: { type: String, required: true }, // game id, 'duel' or 'heist'
    stakes: [{ userId: { type: String, required: true }, amount: { type: Number, required: true }, _id: false }],
    guildId: { type: String, default: null },
    channelId: { type: String, default: null },
  },
  { collection: 'active_rounds', timestamps: true, versionKey: false },
);

export const ActiveRound = model('ActiveRound', activeRoundSchema);

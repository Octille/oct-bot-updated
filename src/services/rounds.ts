import type { ClientSession } from 'mongoose';
import { ActiveRound } from '../models/ActiveRound';
import { apply, inTransaction } from './economy';

export interface RoundPlace {
  guildId: string | null;
  channelId: string | null;
}

export type Stake = { userId: string; amount: number };

/** Records a round in progress (call inside the transaction that takes the stakes). */
export async function openRound(kind: string, stakes: Stake[], place: RoundPlace, session: ClientSession): Promise<string> {
  const [doc] = await ActiveRound.create([{ kind, stakes, ...place }], { session });
  return String(doc!._id);
}

export async function addRoundStake(roundId: string, userId: string, amount: number, session: ClientSession): Promise<void> {
  await ActiveRound.updateOne({ _id: roundId, 'stakes.userId': userId }, { $inc: { 'stakes.$.amount': amount } }, { session });
}

/**
 * Closes a round (call inside the payout transaction). Returns false if it was already closed,
 * e.g. refunded at startup, so the caller must not pay out again.
 */
export async function closeRound(roundId: string, session: ClientSession): Promise<boolean> {
  const res = await ActiveRound.deleteOne({ _id: roundId }, { session });
  return res.deletedCount === 1;
}

export interface Refund {
  kind: string;
  userId: string;
  amount: number;
  channelId: string | null;
}

const GAMES = new Set(['coinflip', 'slots', 'blackjack', 'highlow', 'roulette', 'crash']);

/** Refunds every round left open (the bot restarted mid-round). Each round is refunded once. */
export async function refundOpenRounds(): Promise<Refund[]> {
  const open = await ActiveRound.find({}, null, { lean: true });
  const refunds: Refund[] = [];
  for (const r of open) {
    const done = await inTransaction(async (session) => {
      if (!(await closeRound(String(r._id), session))) return false;
      for (const s of r.stakes) {
        await apply(s.userId, {
          wallet: s.amount,
          // Gambling stats: the stake came back, so count it as paid out
          ...(GAMES.has(r.kind) ? { inc: { 'stats.gambling.paidOut': s.amount, [`stats.gambling.byGame.${r.kind}.paidOut`]: s.amount } } : {}),
        }, { source: `refund.${r.kind}`, session, meta: { roundId: String(r._id) } });
      }
      return true;
    });
    if (done) for (const s of r.stakes) refunds.push({ kind: r.kind, userId: s.userId, amount: s.amount, channelId: r.channelId ?? null });
  }
  return refunds;
}

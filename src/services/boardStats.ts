import type { ClientSession, PipelineStage } from 'mongoose';
import { items } from '../content/items';
import { User } from '../models/User';
import { logError } from '../lib/logger';

/**
 * Leaderboard values stored on each profile (`board.*`) so boards are indexed top-N queries.
 * They're recomputed inside MongoDB from the document itself after every change (apply()), so the
 * last write always leaves them right, even with concurrent updates.
 */


export const boardFields = ['netWorth', 'level', 'fish', 'gambling', 'streak', 'fishdex', 'achievements'] as const;
export type BoardField = (typeof boardFields)[number];

const inventoryValue = {
  $sum: {
    $map: {
      input: { $objectToArray: { $ifNull: ['$inventory', {}] } },
      as: 'i',
      in: {
        $multiply: ['$$i.v', {
          $switch: { branches: items.filter((it) => it.sellPrice > 0).map((it) => ({ case: { $eq: ['$$i.k', it.id] }, then: it.sellPrice })), default: 0 },
        }],
      },
    },
  },
};

export const boardExpr: Record<BoardField, unknown> = {
  // Wallet + bank + item value
  netWorth: { $add: [{ $ifNull: ['$wallet', 0] }, { $ifNull: ['$bank', 0] }, inventoryValue] },
  // Prestige first, then XP, in one sortable number
  level: { $add: [{ $multiply: [{ $ifNull: ['$account.prestige', 0] }, 1e12] }, { $ifNull: ['$account.xp', 0] }] },
  fish: { $ifNull: ['$stats.fishCaught', 0] },
  // Net gambling winnings
  gambling: { $subtract: [{ $ifNull: ['$stats.gambling.paidOut', 0] }, { $ifNull: ['$stats.gambling.wagered', 0] }] },
  streak: { $ifNull: ['$streak.count', 0] },
  fishdex: { $size: { $objectToArray: { $ifNull: ['$fishdex', {}] } } },
  achievements: { $size: { $objectToArray: { $ifNull: ['$achievements', {}] } } },
};

/**
 * A hash of the formulas (including every item's sell price), so any change to them — even a shop
 * price that feeds a buyback price — makes the startup backfill recompute every profile.
 */
export const BOARD_VERSION = (() => {
  let h = 2166136261;
  for (const ch of JSON.stringify(boardExpr)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
})();

const refreshStage: PipelineStage.Set[] = [{
  $set: { ...Object.fromEntries(boardFields.map((f) => [`board.${f}`, boardExpr[f]])), 'board.v': BOARD_VERSION },
}];

/**
 * Recomputes one player's board values. Inside a transaction it commits (or rolls back) with the
 * change. Outside one, the change is already saved, so a failure here is logged, not thrown: a
 * briefly stale board is better than reporting a saved payout as failed (and refunding a cooldown).
 */
export async function refreshBoard(userId: string, session?: ClientSession): Promise<void> {
  if (session) {
    await User.updateOne({ _id: userId }, refreshStage as never, { session });
    return;
  }
  try {
    await User.updateOne({ _id: userId }, refreshStage as never);
  } catch (err) {
    logError('board refresh', err);
  }
}

/** Fills in board values for every profile that doesn't have the current version (startup). */
export async function backfillBoards(): Promise<number> {
  const res = await User.updateMany({ 'board.v': { $ne: BOARD_VERSION } }, refreshStage as never);
  return res.modifiedCount;
}

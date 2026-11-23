import type { ClientSession, PipelineStage } from 'mongoose';
import { items } from '../content/items';
import { User } from '../models/User';

/**
 * Leaderboard values stored on each profile (`board.*`) so boards are indexed top-N queries.
 * They're recomputed inside MongoDB from the document itself after every change (apply()), so the
 * last write always leaves them right, even with concurrent updates.
 */

/** Bump when a formula changes: profiles with an older version are recomputed at startup. */
export const BOARD_VERSION = 1;

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

const refreshStage: PipelineStage.Set[] = [{
  $set: { ...Object.fromEntries(boardFields.map((f) => [`board.${f}`, boardExpr[f]])), 'board.v': BOARD_VERSION },
}];

/** Recomputes one player's board values (inside the caller's transaction, if any). */
export async function refreshBoard(userId: string, session?: ClientSession): Promise<void> {
  await User.updateOne({ _id: userId }, refreshStage as never, { session });
}

/** Fills in board values for every profile that doesn't have the current version (startup). */
export async function backfillBoards(): Promise<number> {
  const res = await User.updateMany({ 'board.v': { $ne: BOARD_VERSION } }, refreshStage as never);
  return res.modifiedCount;
}

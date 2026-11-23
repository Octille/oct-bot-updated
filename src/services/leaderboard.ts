import type { PipelineStage } from 'mongoose';
import { MemberLevel } from '../models/MemberLevel';
import { User } from '../models/User';
import { items } from '../content/items';

export type Metric = 'coins' | 'level' | 'server' | 'fish' | 'gambling' | 'streak' | 'fishdex' | 'achievements';
/** The brief's six boards first, then two extras. */
export const metrics: Metric[] = ['coins', 'server', 'level', 'fish', 'gambling', 'streak', 'fishdex', 'achievements'];

/** Inventory value inside MongoDB: each item's quantity × its sell price (from content/items.ts). */
const inventoryValueExpr = {
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

export interface Row {
  userId: string;
  value: number;
  /** For level: the prestige shown with it. */
  prestige: number;
  level: number;
  badge: string | null;
}

export interface Board {
  rows: Row[];
  total: number;
}

export const PER_PAGE = 10;

/** The sortable value for each metric, computed in the database. */
const valueExpr: Record<Exclude<Metric, 'server'>, unknown> = {
  // Net worth: wallet + bank + item value
  coins: { $add: [{ $ifNull: ['$wallet', 0] }, { $ifNull: ['$bank', 0] }, inventoryValueExpr] },
  fish: { $ifNull: ['$stats.fishCaught', 0] },
  // Net gambling winnings (paid out minus wagered); only players ahead show up
  gambling: { $subtract: [{ $ifNull: ['$stats.gambling.paidOut', 0] }, { $ifNull: ['$stats.gambling.wagered', 0] }] },
  // Prestige first, then XP: one number that sorts the same way
  level: { $add: [{ $multiply: [{ $ifNull: ['$account.prestige', 0] }, 1e12] }, { $ifNull: ['$account.xp', 0] }] },
  fishdex: { $size: { $objectToArray: { $ifNull: ['$fishdex', {}] } } },
  streak: { $ifNull: ['$streak.count', 0] },
  achievements: { $size: { $objectToArray: { $ifNull: ['$achievements', {}] } } },
};

const cache = new Map<string, { at: number; board: Board }>();
const TTL = 60_000;

/**
 * One page of a leaderboard. `members` limits it to a server's members (null = global).
 * Server level is always per server.
 */
export async function board(metric: Metric, page: number, opts: { guildId: string | null; members: string[] | null }): Promise<Board> {
  // Global boards are the same everywhere: only server-scoped (and server-level) boards key on the server
  const key = `${metric}:${page}:${opts.members || metric === 'server' ? opts.guildId : 'global'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.board;

  let result: Board;
  if (metric === 'server') {
    if (!opts.guildId) return { rows: [], total: 0 };
    const filter = { guildId: opts.guildId, xp: { $gt: 0 } };
    const [docs, total] = await Promise.all([
      MemberLevel.find(filter, { userId: 1, xp: 1, level: 1 }, { lean: true }).sort({ xp: -1, userId: 1 }).skip(page * PER_PAGE).limit(PER_PAGE),
      MemberLevel.countDocuments(filter),
    ]);
    const profiles = await User.find({ _id: { $in: docs.map((d) => d.userId) } }, { cosmetics: 1, account: 1 }, { lean: true });
    const byId = new Map(profiles.map((p) => [String(p._id), p]));
    result = {
      total,
      rows: docs.map((d) => ({ userId: d.userId, value: d.xp, level: d.level, prestige: byId.get(d.userId)?.account?.prestige ?? 0, badge: byId.get(d.userId)?.cosmetics?.badge ?? null })),
    };
  } else {
    const pipeline: PipelineStage[] = [
      ...(opts.members ? [{ $match: { _id: { $in: opts.members } } }] : []),
      { $project: { value: valueExpr[metric], prestige: '$account.prestige', level: '$account.level', badge: '$cosmetics.badge' } },
      { $match: { value: { $gt: 0 } } },
      { $sort: { value: -1, _id: 1 } },
      { $facet: { rows: [{ $skip: page * PER_PAGE }, { $limit: PER_PAGE }], total: [{ $count: 'n' }] } },
    ] as PipelineStage[];
    const [out] = await User.aggregate(pipeline);
    result = {
      total: out?.total?.[0]?.n ?? 0,
      rows: (out?.rows ?? []).map((r: { _id: string; value: number; prestige?: number; level?: number; badge?: string | null }) => ({
        userId: String(r._id), value: r.value, prestige: r.prestige ?? 0, level: r.level ?? 0, badge: r.badge ?? null,
      })),
    };
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), board: result });
  return result;
}

const rankCache = new Map<string, { at: number; rank: { rank: number; value: number } | null }>();

/**
 * A player's rank on a board (1-based), or null if they aren't on it. Ties are ordered by id,
 * exactly like the board, so the footer always matches the list. Cached for a minute.
 */
export async function rankOf(metric: Metric, userId: string, opts: { guildId: string | null; members: string[] | null }): Promise<{ rank: number; value: number } | null> {
  const key = `${metric}:${userId}:${opts.members || metric === 'server' ? opts.guildId : 'global'}`;
  const hit = rankCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rank;
  let rank: { rank: number; value: number } | null = null;
  if (metric === 'server') {
    if (!opts.guildId) return null;
    const me = await MemberLevel.findOne({ guildId: opts.guildId, userId }, { xp: 1 }, { lean: true });
    if (me?.xp) {
      const above = await MemberLevel.countDocuments({ guildId: opts.guildId, $or: [{ xp: { $gt: me.xp } }, { xp: me.xp, userId: { $lt: userId } }] });
      rank = { rank: above + 1, value: me.xp };
    }
  } else {
    const [mine] = await User.aggregate([{ $match: { _id: userId } }, { $project: { value: valueExpr[metric] } }]);
    if (mine?.value > 0) {
      const [above] = await User.aggregate([
        ...(opts.members ? [{ $match: { _id: { $in: opts.members } } }] : []),
        { $project: { value: valueExpr[metric] } },
        { $match: { $or: [{ value: { $gt: mine.value } }, { value: mine.value, _id: { $lt: userId } }] } },
        { $count: 'n' },
      ] as PipelineStage[]);
      rank = { rank: (above?.n ?? 0) + 1, value: mine.value };
    }
  }
  if (rankCache.size > 5_000) rankCache.clear();
  rankCache.set(key, { at: Date.now(), rank });
  return rank;
}

export function clearLeaderboardCache(): void {
  cache.clear();
  rankCache.clear();
}

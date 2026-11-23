import type { PipelineStage } from 'mongoose';
import { MemberLevel } from '../models/MemberLevel';
import { User } from '../models/User';

export type Metric = 'coins' | 'level' | 'server' | 'fishdex' | 'streak' | 'achievements';
export const metrics: Metric[] = ['coins', 'level', 'server', 'fishdex', 'streak', 'achievements'];

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
  coins: { $add: [{ $ifNull: ['$wallet', 0] }, { $ifNull: ['$bank', 0] }] },
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
  const key = `${metric}:${page}:${opts.guildId ?? 'global'}:${opts.members ? 'server' : 'global'}`;
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

/** A player's rank on a board (1-based), or null if they aren't on it. */
export async function rankOf(metric: Metric, userId: string, opts: { guildId: string | null; members: string[] | null }): Promise<{ rank: number; value: number } | null> {
  if (metric === 'server') {
    if (!opts.guildId) return null;
    const me = await MemberLevel.findOne({ guildId: opts.guildId, userId }, { xp: 1 }, { lean: true });
    if (!me?.xp) return null;
    const above = await MemberLevel.countDocuments({ guildId: opts.guildId, xp: { $gt: me.xp } });
    return { rank: above + 1, value: me.xp };
  }
  const [mine] = await User.aggregate([{ $match: { _id: userId } }, { $project: { value: valueExpr[metric] } }]);
  if (!mine?.value) return null;
  const [above] = await User.aggregate([
    ...(opts.members ? [{ $match: { _id: { $in: opts.members } } }] : []),
    { $project: { value: valueExpr[metric] } },
    { $match: { value: { $gt: mine.value } } },
    { $count: 'n' },
  ] as PipelineStage[]);
  return { rank: (above?.n ?? 0) + 1, value: mine.value };
}

export function clearLeaderboardCache(): void {
  cache.clear();
}

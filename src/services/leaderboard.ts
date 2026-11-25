import { MemberLevel } from '../models/MemberLevel';
import { User } from '../models/User';
import type { BoardField } from './boardStats';
import { SeasonScore } from '../models/Events';
import { currentSeason } from './seasons';

export type Metric = 'coins' | 'level' | 'server' | 'fish' | 'gambling' | 'streak' | 'fishdex' | 'achievements' | 'season';
/** The brief's six boards first, then two extras. */
export const metrics: Metric[] = ['coins', 'server', 'level', 'fish', 'gambling', 'streak', 'season', 'fishdex', 'achievements'];

/** The stored, indexed value each board sorts by (see services/boardStats.ts). */
const FIELD: Record<Exclude<Metric, 'server' | 'season'>, BoardField> = {
  coins: 'netWorth', level: 'level', fish: 'fish', gambling: 'gambling', streak: 'streak', fishdex: 'fishdex', achievements: 'achievements',
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
const TTL = 60_000;

type Scope = { guildId: string | null; members: string[] | null };

const cache = new Map<string, { at: number; board: Board }>();
const rankCache = new Map<string, { at: number; rank: { rank: number; value: number } | null }>();

/** Global boards are the same everywhere: only server-scoped (and server-level) boards key on the server. */
const scopeKey = (metric: Metric, opts: Scope) => (opts.members || metric === 'server' ? opts.guildId : 'global');

/** One page of a leaderboard (an indexed top-N query). `members` limits it to a server's members. */
export async function board(metric: Metric, page: number, opts: Scope): Promise<Board> {
  const key = `${metric}:${page}:${scopeKey(metric, opts)}`;
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
  } else if (metric === 'season') {
    const season = currentSeason();
    const filter = { season, points: { $gt: 0 }, ...(opts.members ? { userId: { $in: opts.members } } : {}) };
    const [docs, total] = await Promise.all([
      SeasonScore.find(filter, null, { lean: true }).sort({ points: -1, userId: 1 }).skip(page * PER_PAGE).limit(PER_PAGE),
      SeasonScore.countDocuments(filter),
    ]);
    const profiles = await User.find({ _id: { $in: docs.map((d) => d.userId) } }, { cosmetics: 1, account: 1 }, { lean: true });
    const byId = new Map(profiles.map((p) => [String(p._id), p]));
    result = {
      total,
      rows: docs.map((d) => ({ userId: d.userId, value: d.points, level: byId.get(d.userId)?.account?.level ?? 0, prestige: byId.get(d.userId)?.account?.prestige ?? 0, badge: byId.get(d.userId)?.cosmetics?.badge ?? null })),
    };
  } else {
    const path = `board.${FIELD[metric]}`;
    const filter = { ...(opts.members ? { _id: { $in: opts.members } } : {}), [path]: { $gt: 0 } };
    const [docs, total] = await Promise.all([
      User.find(filter, { board: 1, account: 1, 'cosmetics.badge': 1 }, { lean: true }).sort({ [path]: -1, _id: 1 }).skip(page * PER_PAGE).limit(PER_PAGE),
      User.countDocuments(filter),
    ]);
    result = {
      total,
      rows: docs.map((d) => ({
        userId: String(d._id),
        value: d.board?.[FIELD[metric]] ?? 0,
        prestige: d.account?.prestige ?? 0,
        level: d.account?.level ?? 0,
        badge: d.cosmetics?.badge ?? null,
      })),
    };
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), board: result });
  return result;
}

/**
 * A player's rank on a board (1-based), or null if they aren't on it. Ties are ordered by id,
 * exactly like the board, so the footer always matches the list. Cached for a minute.
 */
export async function rankOf(metric: Metric, userId: string, opts: Scope): Promise<{ rank: number; value: number } | null> {
  const key = `${metric}:${userId}:${scopeKey(metric, opts)}`;
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
  } else if (metric === 'season') {
    const season = currentSeason();
    const me = await SeasonScore.findOne({ season, userId }, { points: 1 }, { lean: true });
    if (me?.points) {
      const above = await SeasonScore.countDocuments({ season, ...(opts.members ? { userId: { $in: opts.members } } : {}), $or: [{ points: { $gt: me.points } }, { points: me.points, userId: { $lt: userId } }] });
      rank = { rank: above + 1, value: me.points };
    }
  } else {
    const field = FIELD[metric];
    const path = `board.${field}`;
    const me = await User.findById(userId, { board: 1 }, { lean: true });
    const value = me?.board?.[field] ?? 0;
    if (value > 0) {
      const above = await User.countDocuments({
        ...(opts.members ? { _id: { $in: opts.members } } : {}),
        $or: [{ [path]: { $gt: value } }, { [path]: value, _id: { $lt: userId } }],
      });
      rank = { rank: above + 1, value };
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

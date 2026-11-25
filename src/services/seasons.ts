import { env } from '../config/env';
import { seasonRules } from '../content/events';
import { SeasonEnd, SeasonScore } from '../models/Events';
import { User } from '../models/User';
import { apply, inTransaction } from './economy';

const DAY = 86_400_000;

export interface SeasonConfig {
  start: Date | null;
  lengthDays: number;
}

export function seasonConfig(): SeasonConfig {
  const start = env.SEASON_1_START ? new Date(env.SEASON_1_START) : null;
  return { start: start && !Number.isNaN(start.getTime()) ? start : null, lengthDays: env.SEASON_LENGTH_DAYS ?? seasonRules.lengthDays };
}

/** The current season number (1, 2, …), or 0 before Season 1. */
export function currentSeason(now = new Date(), cfg = seasonConfig()): number {
  if (!cfg.start || now < cfg.start) return 0;
  return Math.floor((now.getTime() - cfg.start.getTime()) / (cfg.lengthDays * DAY)) + 1;
}

export function seasonBounds(season: number, cfg = seasonConfig()): { start: Date; end: Date } | null {
  if (!cfg.start || season < 1) return null;
  const start = new Date(cfg.start.getTime() + (season - 1) * cfg.lengthDays * DAY);
  return { start, end: new Date(start.getTime() + cfg.lengthDays * DAY) };
}

/** Adds season points (no-op before Season 1). Never creates a game profile. */
export async function addSeasonPoints(userId: string, points: number, now = new Date()): Promise<void> {
  const season = currentSeason(now);
  if (!season || points <= 0) return;
  await SeasonScore.updateOne({ season, userId }, { $inc: { points } }, { upsert: true });
}

export async function seasonRank(season: number, userId: string): Promise<{ rank: number; points: number } | null> {
  const me = await SeasonScore.findOne({ season, userId }, { points: 1 }, { lean: true });
  if (!me?.points) return null;
  const above = await SeasonScore.countDocuments({ season, $or: [{ points: { $gt: me.points } }, { points: me.points, userId: { $lt: userId } }] });
  return { rank: above + 1, points: me.points };
}

export function rewardFor(place: number) {
  return seasonRules.rewards.find((r) => place >= r.from && place <= r.to) ?? null;
}

/**
 * Pays a finished season's rewards, once: the SeasonEnd row is inserted in the same transaction
 * as the payouts, so a second run (or an overlapping job) fails on the duplicate key.
 */
export async function payoutSeason(season: number): Promise<{ season: number; winners: { userId: string; place: number; points: number }[] } | null> {
  if (await SeasonEnd.exists({ _id: season })) return null;
  const last = seasonRules.rewards.at(-1)!.to;
  const top = await SeasonScore.find({ season, points: { $gte: seasonRules.minPoints } }, null, { lean: true }).sort({ points: -1, userId: 1 }).limit(last);
  // Only players who still have a profile
  const existing = new Set((await User.find({ _id: { $in: top.map((t) => t.userId) } }, { _id: 1 }, { lean: true })).map((u) => String(u._id)));
  const winners = top.filter((t) => existing.has(t.userId)).map((t, i) => ({ userId: t.userId, place: i + 1, points: t.points }));
  try {
    await inTransaction(async (session) => {
      await SeasonEnd.create([{ _id: season, winners: winners.length }], { session });
      for (const w of winners) {
        const r = rewardFor(w.place)!;
        await apply(w.userId, {
          wallet: r.coins,
          items: { [r.crate]: 1 },
          addToSet: { 'cosmetics.owned': [r.badge], seasonAwards: [{ season, place: w.place }] },
        }, { source: 'season.reward', session, meta: { season, place: w.place } });
      }
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null; // already paid
    throw err;
  }
  return { season, winners };
}

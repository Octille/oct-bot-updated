import { EconomySnapshot } from '../models/EconomySnapshot';
import { Transaction } from '../models/Transaction';
import { User } from '../models/User';
import { MIGRATION_SOURCE } from '../migration/v2';

/**
 * Inflation stats for /eco stats, from the transaction log. Coins moving between players
 * (`transfer: true`) and between a player's own wallet and bank (they net to zero per source) don't
 * count. Coins carried over from v2 are logged as `migration.v2` and left out, so day-one imports
 * don't look like inflation. Sources are grouped by their first part (`gamble.slots.bet` → `gamble`),
 * so a bet and its payout net out to the house edge.
 */

const DAY_MS = 86_400_000;
export const dayNumber = (d: Date | number) => Math.floor(new Date(d).getTime() / DAY_MS);

/** Rows that create or destroy coins. */
const coinRows = (since: Date) => ({
  at: { $gte: since },
  kind: { $in: ['wallet', 'bank'] },
  transfer: { $ne: true },
  source: { $ne: MIGRATION_SOURCE },
});
const groupKey = { $arrayElemAt: [{ $split: ['$source', '.'] }, 0] };

export interface Flow { source: string; net: number }
export interface FlowSummary { created: number; destroyed: number; net: number; bySource: Flow[] }

/** Coins created and destroyed since a time, with the net per source group (largest first). */
export async function coinFlows(since: Date): Promise<FlowSummary> {
  const rows = await Transaction.aggregate<{ _id: string; net: number }>([
    { $match: coinRows(since) },
    { $group: { _id: groupKey, net: { $sum: '$delta' } } },
  ]);
  const bySource = rows.filter((r) => r.net !== 0).map((r) => ({ source: r._id, net: r.net })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const created = bySource.filter((f) => f.net > 0).reduce((s, f) => s + f.net, 0);
  const destroyed = -bySource.filter((f) => f.net < 0).reduce((s, f) => s + f.net, 0);
  return { created, destroyed, net: created - destroyed, bySource };
}

export interface DayFlow { day: number; created: number; destroyed: number }

/** Created vs destroyed per UTC day for the last `days` days (oldest first, empty days included). */
export async function dailyFlows(days: number, now = new Date()): Promise<DayFlow[]> {
  const today = dayNumber(now);
  const since = new Date((today - days + 1) * DAY_MS);
  const rows = await Transaction.aggregate<{ _id: { day: number; src: string }; net: number }>([
    { $match: coinRows(since) },
    { $group: { _id: { day: { $floor: { $divide: [{ $toLong: '$at' }, DAY_MS] } }, src: groupKey }, net: { $sum: '$delta' } } },
  ]);
  const out = new Map<number, DayFlow>();
  for (let d = today - days + 1; d <= today; d++) out.set(d, { day: d, created: 0, destroyed: 0 });
  for (const r of rows) {
    const f = out.get(Number(r._id.day));
    if (!f) continue;
    if (r.net > 0) f.created += r.net;
    else f.destroyed -= r.net;
  }
  return [...out.values()];
}

/** Coins in circulation right now. */
export async function moneySupply(): Promise<{ wallet: number; bank: number; players: number }> {
  const [row] = await User.aggregate<{ wallet: number; bank: number; players: number }>([
    { $group: { _id: null, wallet: { $sum: '$wallet' }, bank: { $sum: '$bank' }, players: { $sum: 1 } } },
  ]);
  return { wallet: row?.wallet ?? 0, bank: row?.bank ?? 0, players: row?.players ?? 0 };
}

/** Records today's money supply once (the daily job; safe to run again). */
export async function snapshotSupply(now = new Date()): Promise<void> {
  const supply = await moneySupply();
  await EconomySnapshot.updateOne({ _id: dayNumber(now) }, { $setOnInsert: { ...supply, at: now } }, { upsert: true });
}

/** Daily money supply for the last `days` days (oldest first, only days with a snapshot). */
export async function supplyHistory(days: number, now = new Date()) {
  return EconomySnapshot.find({ _id: { $gt: dayNumber(now) - days } }, null, { lean: true }).sort({ _id: 1 });
}

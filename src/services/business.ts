import { businessRules, businessTiers, hireCost, type BusinessTier } from '../content/business';
import { EconomyError, UserError } from '../lib/errors';
import { defaultRng, weighted, type Rng } from '../lib/rng';
import { apply, getProfile, type Profile } from './economy';
import { User } from '../models/User';
import { unlockLevel } from './progression';

type BizSource = Partial<Pick<Profile, 'business'>>;

export function tierOf(id: string | null | undefined) {
  return businessTiers.find((t) => t.id === id);
}

/** Gross income per hour right now. */
export function incomePerHour(p: BizSource): number {
  const t = tierOf(p.business?.tier);
  return t ? t.perWorkerHour * (p.business?.workers ?? 0) : 0;
}

export function capHours(p: BizSource): number {
  return p.business?.manager ? businessRules.managerCapHours : businessRules.offlineCapHours;
}

/** Built up since the last collection, after upkeep, capped. */
export function pendingIncome(p: BizSource, now = Date.now()): { amount: number; hours: number; capped: boolean } {
  const last = p.business?.lastTick ? new Date(p.business.lastTick).getTime() : now;
  const hours = Math.max(0, (now - last) / 3_600_000);
  const counted = Math.min(hours, capHours(p));
  return { amount: Math.floor(incomePerHour(p) * counted * (1 - businessRules.upkeep)), hours, capped: hours >= capHours(p) };
}

export async function buyTier(userId: string, tier: BusinessTier): Promise<void> {
  const p = await getProfile(userId);
  const t = tierOf(tier)!;
  const current = businessTiers.findIndex((x) => x.id === p.business?.tier);
  const target = businessTiers.findIndex((x) => x.id === tier);
  if (target !== current + 1) throw new UserError(current < 0 ? `Start with the ${businessTiers[0]!.name}.` : 'Upgrade one step at a time.');
  if (unlockLevel(p) < t.level) throw new UserError(`The ${t.name} needs account level ${t.level}.`);
  // Upgrading pays out what's pending first (at the old rate), then switches
  const pending = pendingIncome(p);
  try {
    await apply(userId, {
      wallet: pending.amount - t.price,
      set: { 'business.tier': tier, 'business.lastTick': new Date() },
      inc: { 'business.collected': pending.amount },
      where: { 'business.tier': p.business?.tier ?? null, 'business.lastTick': p.business?.lastTick ?? null },
    }, { source: 'business.buy', meta: { tier } });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError(err.code === 'CONFLICT' ? 'Something changed. Try again.' : `You need ${t.price.toLocaleString('en-US')} coins.`);
    throw err;
  }
}

export async function hireWorker(userId: string): Promise<number> {
  const p = await getProfile(userId);
  const t = tierOf(p.business?.tier);
  if (!t) throw new UserError("You don't have a business yet.");
  const workers = p.business?.workers ?? 0;
  if (workers >= t.maxWorkers) throw new UserError(`Your ${t.name} is full (${t.maxWorkers} workers). Upgrade for more income per worker.`);
  const cost = hireCost(t.id, workers);
  const pending = pendingIncome(p);
  try {
    // Settle what's pending at the old rate so the new worker doesn't earn retroactively
    await apply(userId, {
      wallet: pending.amount - cost,
      set: { 'business.lastTick': new Date() },
      inc: { 'business.workers': 1, 'business.collected': pending.amount },
      where: { 'business.workers': workers, 'business.lastTick': p.business?.lastTick ?? null },
    }, { source: 'business.hire' });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError(err.code === 'CONFLICT' ? 'Something changed. Try again.' : `Hiring costs ${cost.toLocaleString('en-US')} coins.`);
    throw err;
  }
  return cost;
}

export async function hireManager(userId: string): Promise<number> {
  const p = await getProfile(userId);
  const t = tierOf(p.business?.tier);
  if (!t) throw new UserError("You don't have a business yet.");
  if (p.business?.manager) throw new UserError('You already have a manager.');
  const cost = Math.round(t.price * businessRules.managerShare);
  try {
    await apply(userId, { wallet: -cost, set: { 'business.manager': true }, where: { 'business.manager': { $ne: true } } }, { source: 'business.manager' });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError(`A manager costs ${cost.toLocaleString('en-US')} coins.`);
    throw err;
  }
  return cost;
}

export interface Collection {
  amount: number;
  event: (typeof businessRules.events)[number];
}

/** Collects pending income. Guarded on lastTick, so a double click can't pay twice. */
export async function collectBusiness(userId: string, now = new Date(), rng: Rng = defaultRng): Promise<Collection> {
  const p = await getProfile(userId);
  if (!tierOf(p.business?.tier)) throw new UserError("You don't have a business yet.");
  const pending = pendingIncome(p, now.getTime());
  if (pending.amount <= 0) throw new UserError('Nothing to collect yet.');
  const event = weighted(businessRules.events, (e) => e.weight, rng);
  const amount = Math.floor(pending.amount * event.mult);
  try {
    await apply(userId, {
      wallet: amount || undefined,
      set: { 'business.lastTick': now },
      inc: { 'business.collected': amount },
      where: { 'business.lastTick': p.business?.lastTick ?? null },
    }, { source: 'business.collect', meta: { event: event.id } });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError('Already collected.');
    throw err;
  }
  return { amount, event };
}

/** Managers collect automatically once enough has built up (hourly job). */
export async function managerCollectAll(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - businessRules.managerCollectHours * 3_600_000);
  const due = await User.find({ 'business.manager': true, 'business.lastTick': { $lte: cutoff } }, { _id: 1 }, { lean: true });
  let n = 0;
  for (const u of due) {
    try {
      await collectBusiness(String(u._id), now);
      n++;
    } catch { /* collected meanwhile, or nothing pending */ }
  }
  return n;
}

import { bailPerMinute } from '../content/crime';
import { EconomyError, UserError } from '../lib/errors';
import { apply, getProfile } from './economy';

export function isJailed(jailUntil: Date | null | undefined, now = Date.now()): boolean {
  return !!jailUntil && new Date(jailUntil).getTime() > now;
}

/** Bail for the time left, rounded up to whole minutes. */
export function bailCost(jailUntil: Date, now = Date.now()): number {
  const minutes = Math.max(1, Math.ceil((new Date(jailUntil).getTime() - now) / 60_000));
  return minutes * bailPerMinute;
}

export async function payBail(userId: string): Promise<number> {
  const profile = await getProfile(userId);
  if (!isJailed(profile.jailUntil)) throw new UserError("You're not in jail.");
  const cost = bailCost(profile.jailUntil!);
  try {
    await apply(userId, { wallet: -cost, set: { jailUntil: null }, where: { jailUntil: profile.jailUntil } }, { source: 'bail' });
  } catch (err) {
    if (err instanceof EconomyError && err.code === 'CONFLICT') throw new UserError('Your sentence changed. Try again.');
    throw err;
  }
  return cost;
}

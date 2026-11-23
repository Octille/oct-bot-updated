import type { Crime } from '../content/crime';
import { chance, defaultRng, pick, randInt, type Rng } from '../lib/rng';

export type CrimeResult =
  | { success: true; coins: number; line: string }
  | { success: false; fine: number; jailMinutes: number; line: string };

export function commitCrime(crime: Crime, wallet: number, incomeMult: number, rng: Rng = defaultRng): CrimeResult {
  if (chance(crime.success, rng)) {
    return { success: true, coins: Math.round(randInt(crime.payout[0], crime.payout[1], rng) * incomeMult), line: pick(crime.successLines, rng) };
  }
  // The fine can't be more than you're carrying
  return { success: false, fine: Math.min(crime.fine, Math.max(0, wallet)), jailMinutes: crime.jailMinutes, line: pick(crime.failLines, rng) };
}

export function expectedCrimeValue(crime: Crime): number {
  return crime.success * ((crime.payout[0] + crime.payout[1]) / 2) - (1 - crime.success) * crime.fine;
}

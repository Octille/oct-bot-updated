import { crimeLoot, type Crime } from '../content/crime';
import { getItem } from '../content/items';
import { chance, defaultRng, pick, randInt, weighted, type Rng } from '../lib/rng';

export type CrimeResult =
  | { success: true; coins: number; line: string; loot: string | null }
  | { success: false; fine: number; jailMinutes: number; line: string };

export function commitCrime(crime: Crime, wallet: number, incomeMult: number, rng: Rng = defaultRng): CrimeResult {
  if (chance(crime.success, rng)) {
    const coins = Math.round(randInt(crime.payout[0], crime.payout[1], rng) * incomeMult);
    const loot = chance(crime.dropChance, rng) ? weighted(crimeLoot, (l) => l.weight, rng).itemId : null;
    return { success: true, coins, line: pick(crime.successLines, rng), loot };
  }
  // The fine can't be more than you're carrying
  return { success: false, fine: Math.min(crime.fine, Math.max(0, wallet)), jailMinutes: crime.jailMinutes, line: pick(crime.failLines, rng) };
}

export function expectedLootValue(): number {
  const total = crimeLoot.reduce((s, l) => s + l.weight, 0);
  return crimeLoot.reduce((s, l) => s + (l.weight / total) * (getItem(l.itemId)?.sellPrice ?? 0), 0);
}

/** Average coins per attempt, counting crime loot at its sell price. */
export function expectedCrimeValue(crime: Crime): number {
  const payout = (crime.payout[0] + crime.payout[1]) / 2 + crime.dropChance * expectedLootValue();
  return crime.success * payout - (1 - crime.success) * crime.fine;
}

import { highlowReturn } from '../../content/gambling';

/** Infinite deck: the next rank is uniform over 1–13. Ties count as a win for either guess. */
export function highlowChance(rank: number, guess: 'higher' | 'lower'): number {
  return guess === 'higher' ? (14 - rank) / 13 : rank / 13;
}

/** Multiplier on the running pot for a correct guess, or null if the guess is disabled (pays ≤ 1×). */
export function highlowMultiplier(rank: number, guess: 'higher' | 'lower'): number | null {
  const m = highlowReturn / highlowChance(rank, guess);
  return m > 1.0001 ? Math.floor(m * 100) / 100 : null;
}

export function highlowWins(current: number, next: number, guess: 'higher' | 'lower'): boolean {
  return guess === 'higher' ? next >= current : next <= current;
}

import { coinflipPayout, RED_NUMBERS, slotsAnyPair, slotSymbols, slotsTwoCherries, type RouletteBet } from '../../content/gambling';
import { randInt, weighted, type Rng } from '../../lib/rng';

/* Coinflip */
export function coinflip(call: 'heads' | 'tails', rng: Rng): { side: 'heads' | 'tails'; multiplier: number } {
  const side = rng.next() < 0.5 ? 'heads' : 'tails';
  return { side, multiplier: side === call ? coinflipPayout : 0 };
}

/* Slots */
export type SlotSymbol = (typeof slotSymbols)[number];

export function slotsMultiplier(reels: readonly SlotSymbol[]): number {
  const [a, b, c] = reels as [SlotSymbol, SlotSymbol, SlotSymbol];
  if (a.id === b.id && b.id === c.id) return a.three;
  const cherries = reels.filter((s) => s.id === 'cherry').length;
  if (cherries === 2) return slotsTwoCherries;
  if (a.id === b.id || b.id === c.id || a.id === c.id) return slotsAnyPair;
  return 0;
}

export function spinSlots(rng: Rng): { reels: SlotSymbol[]; multiplier: number } {
  const reels = [0, 1, 2].map(() => weighted(slotSymbols, (s) => s.weight, rng));
  return { reels, multiplier: slotsMultiplier(reels) };
}

/** Exact expected return of slots (sum over every reel combination). */
export function slotsReturn(): number {
  const total = slotSymbols.reduce((s, x) => s + x.weight, 0);
  let ev = 0;
  for (const a of slotSymbols) for (const b of slotSymbols) for (const c of slotSymbols) {
    ev += (a.weight * b.weight * c.weight) / total ** 3 * slotsMultiplier([a, b, c]);
  }
  return ev;
}

/* Roulette */
export function rouletteColor(n: number): 'red' | 'black' | 'green' {
  return n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function rouletteMultiplier(bet: RouletteBet, n: number): number {
  if (n === 0) return bet.kind === 'number' && bet.number === 0 ? 36 : 0;
  switch (bet.kind) {
    case 'red': case 'black': return rouletteColor(n) === bet.kind ? 2 : 0;
    case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'even': return n % 2 === 0 ? 2 : 0;
    case 'low': return n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'dozen': return Math.ceil(n / 12) === bet.dozen ? 3 : 0;
    case 'number': return bet.number === n ? 36 : 0;
  }
}

export function spinRoulette(bet: RouletteBet, rng: Rng): { number: number; multiplier: number } {
  const number = randInt(0, 36, rng);
  return { number, multiplier: rouletteMultiplier(bet, number) };
}

/** Exact expected return of a roulette bet. */
export function rouletteReturn(bet: RouletteBet): number {
  let ev = 0;
  for (let n = 0; n <= 36; n++) ev += rouletteMultiplier(bet, n) / 37;
  return ev;
}

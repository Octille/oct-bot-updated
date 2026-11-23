import { beg, search } from '../content/earning';
import { searchItemWeights } from '../content/items';
import { chance, defaultRng, pick, randInt, shuffle, weighted, type Rng } from '../lib/rng';

export type BegResult = { kind: 'nothing'; line: string } | { kind: 'coins' | 'jackpot'; coins: number; line: string };

export function rollBeg(incomeMult: number, rng: Rng = defaultRng): BegResult {
  if (chance(beg.nothingChance, rng)) return { kind: 'nothing', line: pick(beg.nothingLines, rng) };
  if (chance(beg.jackpotChance, rng)) {
    return { kind: 'jackpot', coins: Math.round(randInt(beg.jackpot[0], beg.jackpot[1], rng) * incomeMult), line: pick(beg.jackpotLines, rng) };
  }
  return { kind: 'coins', coins: Math.round(randInt(beg.normal[0], beg.normal[1], rng) * incomeMult), line: pick(beg.donors, rng) };
}

export function rollSpots(rng: Rng = defaultRng) {
  return shuffle(search.spots, rng).slice(0, 3);
}

export type SearchResult =
  | { kind: 'coins'; coins: number }
  | { kind: 'item'; itemId: string }
  | { kind: 'mishap'; loss: number; line: string }
  | { kind: 'nothing'; line: string };

export function rollSearch(incomeMult: number, rng: Rng = defaultRng): SearchResult {
  const roll = rng.next();
  if (roll < search.coinsChance) {
    return { kind: 'coins', coins: Math.round(randInt(search.coins[0], search.coins[1], rng) * incomeMult) };
  }
  if (roll < search.coinsChance + search.itemChance) {
    return { kind: 'item', itemId: weighted(Object.keys(searchItemWeights), (id) => searchItemWeights[id] ?? 0, rng) };
  }
  if (roll < search.coinsChance + search.itemChance + search.mishapChance) {
    return { kind: 'mishap', loss: randInt(search.mishapLoss[0], search.mishapLoss[1], rng), line: pick(search.mishapLines, rng) };
  }
  return { kind: 'nothing', line: pick(search.nothingLines, rng) };
}

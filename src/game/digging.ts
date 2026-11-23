import { digLuckPerPoint, gridSize, squareOdds, treasureRarityWeights, treasures, treasureValue, type Treasure } from '../content/digging';
import { rarities } from '../content/rarity';
import { defaultRng, pick, randInt, weighted, type Rng } from '../lib/rng';
import { boostedWeights, weightedAverage } from './loot';

export type Square =
  | { kind: 'treasure'; treasure: Treasure; value: number }
  | { kind: 'coins'; coins: number }
  | { kind: 'junk'; itemId: string }
  | { kind: 'dirt' };

export interface Plot {
  squares: Square[];
  treasureAt: number;
}

export function makePlot(luck: number, valueMult: number, rng: Rng = defaultRng): Plot {
  const cells = gridSize * gridSize;
  const treasureAt = randInt(0, cells - 1, rng);
  const weights = boostedWeights(treasureRarityWeights, luck, digLuckPerPoint);
  const squares: Square[] = [];
  for (let i = 0; i < cells; i++) {
    if (i === treasureAt) {
      const rarity = weighted(rarities, (r) => weights[r], rng);
      const treasure = pick(treasures.filter((t) => t.rarity === rarity), rng);
      squares.push({ kind: 'treasure', treasure, value: Math.round(treasureValue[rarity] * valueMult) });
      continue;
    }
    const roll = rng.next();
    if (roll < squareOdds.coins) squares.push({ kind: 'coins', coins: Math.round(randInt(squareOdds.coinRange[0], squareOdds.coinRange[1], rng) * valueMult) });
    else if (roll < squareOdds.coins + squareOdds.junk) squares.push({ kind: 'junk', itemId: pick(squareOdds.junk_items, rng) });
    else squares.push({ kind: 'dirt' });
  }
  return { squares, treasureAt };
}

export type Warmth = 'hot' | 'warm' | 'cold';

/**
 * 🔥 hot: the treasure is in a neighbouring square (diagonals count).
 * 🌡️ warm: not next to it, but in the same row or column.
 * ❄️ cold: anywhere else.
 */
export function warmth(index: number, treasureAt: number): Warmth {
  const [r1, c1] = [Math.floor(index / gridSize), index % gridSize];
  const [r2, c2] = [Math.floor(treasureAt / gridSize), treasureAt % gridSize];
  if (Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) <= 1) return 'hot';
  return r1 === r2 || c1 === c2 ? 'warm' : 'cold';
}

export function appraisalBonus(square: Extract<Square, { kind: 'treasure' }>): number {
  return Math.max(0, square.value - treasureValue[square.treasure.rarity]);
}

/**
 * Chance of finding the treasure with `digs` digs for a player who follows the hints and starts
 * in a corner or edge square (simulated in tests: ~44% with 2 digs, 78–85% with 3).
 * Starting in the centre is a trap — its hint can't be anything but hot. Used for BALANCE.md.
 */
export const findChance: Record<number, number> = { 1: 1 / 9, 2: 0.44, 3: 0.78 };

export function expectedDigValue(digs: number, luck: number, valueMult: number): number {
  const p = findChance[digs] ?? findChance[3]!;
  const treasure = weightedAverage(boostedWeights(treasureRarityWeights, luck, digLuckPerPoint), treasureValue) * valueMult;
  const otherDigs = digs - p;
  const perSquare = squareOdds.coins * ((squareOdds.coinRange[0] + squareOdds.coinRange[1]) / 2) * valueMult + squareOdds.junk * 20;
  return p * treasure + otherDigs * perSquare;
}

import { randInt, type Rng } from '../../lib/rng';

export interface Card {
  /** 1 = Ace … 11 = Jack, 12 = Queen, 13 = King */
  rank: number;
  suit: 0 | 1 | 2 | 3;
}

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const NAMES: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

export function cardText(c: Card): string {
  return `${NAMES[c.rank] ?? c.rank}${SUITS[c.suit]}`;
}

/** A random card from a fresh shoe (each draw independent). */
export function drawCard(rng: Rng): Card {
  return { rank: randInt(1, 13, rng), suit: randInt(0, 3, rng) as Card['suit'] };
}

/** A shuffled shoe of `decks` decks, drawn from the end. */
export function makeShoe(decks: number, rng: Rng): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) shoe.push({ rank: r, suit: s as Card['suit'] });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j]!, shoe[i]!];
  }
  return shoe;
}

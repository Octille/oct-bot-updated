/**
 * Gambling: limits, odds and payouts. Every game has a fixed house edge, checked by tests
 * (tests/gambling.test.ts) and listed in BALANCE.md.
 */

export type GameId = 'coinflip' | 'slots' | 'blackjack' | 'highlow' | 'roulette' | 'crash';

export const MIN_BET = 100;
/** No single round pays more than this. Each game's max bet is set so it can't. */
export const MAX_PAYOUT = 2_500_000;

/** Max bet by account level (best-ever level, so prestiging doesn't lower it). */
export function levelMaxBet(level: number): number {
  return Math.min(250_000, 10_000 + 5_000 * level);
}

/** The largest multiple of the bet each game can return (sets its max bet under MAX_PAYOUT). */
export const maxMultiplier: Record<GameId, number> = {
  coinflip: 1.95,
  slots: 25,
  blackjack: 4, // a won double
  roulette: 36, // a single number
  // These two auto-cash-out at MAX_PAYOUT instead, so they don't limit the bet
  highlow: 1,
  crash: 1,
};

export function maxBet(game: GameId, level: number, rouletteKind?: RouletteBet['kind']): number {
  const mult = game === 'roulette' && rouletteKind !== 'number' ? 3 : maxMultiplier[game];
  return Math.max(MIN_BET, Math.min(levelMaxBet(level), Math.floor(MAX_PAYOUT / mult)));
}

export const gameInfo: Record<GameId, { name: string; command: string; rules: string }> = {
  coinflip: { name: 'Coinflip', command: 'coinflip', rules: 'Call heads or tails. Win 1.95×.' },
  slots: { name: 'Slots', command: 'slots', rules: 'Three reels. Three of a kind pays up to 25×; two cherries pay too.' },
  blackjack: { name: 'Blackjack', command: 'blackjack', rules: 'Beat the dealer without going over 21. Blackjack pays 3:2. Dealer stands on 17.' },
  highlow: { name: 'High-Low', command: 'highlow', rules: 'Guess if the next card is higher or lower (ties win). Cash out any time.' },
  roulette: { name: 'Roulette', command: 'roulette', rules: 'European wheel (0–36). Colours, odd/even and halves pay 2×, dozens 3×, a number 36×.' },
  crash: { name: 'Crash', command: 'crash', rules: 'The multiplier climbs until it crashes. Cash out before it does.' },
};

/* ── Coinflip ───────────────────────────────────────────────────────────────────────────── */
export const coinflipPayout = 1.95;

/* ── Slots ──────────────────────────────────────────────────────────────────────────────── */
export const slotSymbols = [
  { id: 'cherry', emoji: '🍒', weight: 8, three: 4 },
  { id: 'lemon', emoji: '🍋', weight: 7, three: 5 },
  { id: 'orange', emoji: '🍊', weight: 6, three: 7 },
  { id: 'grape', emoji: '🍇', weight: 5, three: 10 },
  { id: 'bell', emoji: '🔔', weight: 3, three: 15 },
  { id: 'star', emoji: '⭐', weight: 2, three: 20 },
  { id: 'diamond', emoji: '💎', weight: 1.4, three: 25 },
] as const;
/** Exactly two cherries (anywhere) pays this. */
export const slotsTwoCherries = 2.2;
/** Any pair (other than cherries) pays this. */
export const slotsAnyPair = 1.5;

/* ── Blackjack ──────────────────────────────────────────────────────────────────────────── */
export const blackjackRules = {
  /** Dealer stands on all 17s. */
  dealerHitsSoft17: false,
  blackjackPays: 1.5,
  /** Decks in the shoe (reshuffled every round). */
  decks: 6,
} as const;

/* ── High-low ───────────────────────────────────────────────────────────────────────────── */
/** Each guess pays fair odds × this (3% edge per guess). Guesses paying ≤ 1× are disabled. */
export const highlowReturn = 0.97;

/* ── Roulette ───────────────────────────────────────────────────────────────────────────── */
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type RouletteBet =
  | { kind: 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' }
  | { kind: 'dozen'; dozen: 1 | 2 | 3 }
  | { kind: 'number'; number: number };

/* ── Crash ──────────────────────────────────────────────────────────────────────────────── */
export const crashRules = {
  /** P(crash point ≥ x) = houseReturn / x, so 3% of rounds crash at 1.00×. */
  houseReturn: 0.97,
  /** Multiplier growth: doubles every this many seconds. */
  doubleEverySeconds: 8,
  /** Highest crash point (the round always ends by here). */
  maxMultiplier: 1_000,
} as const;

/**
 * House edge per game, as shown to players. Each is checked by tests/gambling.test.ts:
 * exact for coinflip, slots, roulette and crash; blackjack from a 2M-hand basic-strategy simulation
 * (S17, 3:2, double on any two, no split); high-low is per guess.
 */
export const houseEdge: Record<GameId, number> = {
  coinflip: 0.025,
  slots: 0.0463,
  blackjack: 0.0114,
  highlow: 0.03,
  roulette: 1 / 37,
  crash: 0.03,
};

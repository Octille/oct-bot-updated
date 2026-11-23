import type { Rarity } from './rarity';

/** Cooldowns in seconds for the quick earning commands. */
export const cooldowns = {
  beg: 90,
  search: 180,
  work: 600,
  mine: 300,
  fish: 180,
} as const;

export const beg = {
  /** Chance of getting nothing at all. */
  nothingChance: 0.12,
  /** Chance of a big donation instead of a normal one. */
  jackpotChance: 0.03,
  normal: [10, 50],
  jackpot: [200, 400],
  donors: [
    'A pigeon dropped', 'A confused tourist tossed you', 'Your nan slipped you', 'A streamer donated',
    'Someone mistook you for a vending machine and paid', 'A passing Octopus tentacle-flicked you',
    'A guy in a suit sighed and handed you', 'You found a tip jar with', 'A kid gave you their lunch money:',
    'The wind blew in',
  ],
  nothingLines: [
    'Everyone walked past. Brutal.', 'A seagull stole your sign.', 'Someone gave you advice instead of money.',
    'You got a "maybe later". It was not later.', 'A mime stared at you for 10 minutes and left.',
  ],
  jackpotLines: ['A millionaire felt generous:', 'You got scouted by a talent agent who paid', 'Lottery winner on the street threw you'],
} as const;

/** /search — pick one of three random spots. */
export const search = {
  coinsChance: 0.65,
  itemChance: 0.12,
  mishapChance: 0.08,
  // the rest is "found nothing"
  coins: [60, 250],
  mishapLoss: [30, 150],
  spots: [
    { name: 'couch cushions', emoji: '🛋️' },
    { name: 'car', emoji: '🚗' },
    { name: 'park bench', emoji: '🌳' },
    { name: 'laundromat', emoji: '🧺' },
    { name: 'dumpster', emoji: '🗑️' },
    { name: 'old jacket', emoji: '🧥' },
    { name: 'bus stop', emoji: '🚏' },
    { name: 'arcade', emoji: '🕹️' },
    { name: 'library', emoji: '📚' },
    { name: 'beach', emoji: '🏖️' },
    { name: 'attic', emoji: '🏚️' },
    { name: 'gym locker', emoji: '🔒' },
  ],
  nothingLines: ['Just crumbs and regret.', 'Someone got here first.', 'You found a receipt for something you never bought.', 'Empty. Like your wallet.'],
  mishapLines: ['A dog chased you off and you dropped', 'You tripped into a puddle and lost', 'Security fined you', 'A raccoon mugged you for'],
  /** Collectibles that /search can turn up (see items.ts). */
  items: ['lost_sock', 'rubber_duck', 'old_coin', 'golden_ticket'] as const,
} as const;

/** /daily and /weekly */
export const daily = {
  base: 7_500,
  // Claims reset at 00:00 UTC; missing a whole UTC day resets the streak.
  /** [minimum streak, multiplier] — highest matching tier applies. */
  multipliers: [[60, 2.5], [30, 2], [14, 1.75], [7, 1.5], [3, 1.25], [0, 1]] as const,
  /** One-off bonus coins on reaching these streaks. */
  milestones: { 3: 2_500, 7: 10_000, 14: 25_000, 30: 75_000, 60: 200_000, 100: 500_000 } as Record<number, number>,
} as const;

export const weekly = {
  base: 20_000,
  /** +10% per consecutive week, up to this multiplier. */
  maxMultiplier: 2,
  perWeekBonus: 0.1,
  /** Weekly claims more than this many days apart reset the weekly streak. */
  streakWindowDays: 14,
} as const;

export function dailyMultiplier(streak: number): number {
  for (const [min, mult] of daily.multipliers) if (streak >= min) return mult;
  return 1;
}

export type SearchItem = (typeof search.items)[number];
export type { Rarity };

/** Cooldowns (seconds) for the Phase 2b loops. */
export const moreCooldowns = {
  hunt: 240,
  dig: 300,
  crime: 600,
} as const;

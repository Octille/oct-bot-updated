/** Rob, heist, duel, give and gift rules. */

/** Tax destroyed on coins sent to another player (give, coins in trades, the duel pot). */
export const giveTax = 0.05;
/** Giving, gifting and trading need this account level (slows down alt accounts). */
export const transferMinLevel = 3;

export const robRules = {
  minLevel: 5,
  cooldownMinutes: 30,
  /** Robber needs this much in their wallet (it covers the fine). */
  robberMinWallet: 2_000,
  /** Targets below this aren't worth it (above the ₪1,000 everyone starts with). */
  targetMinWallet: 2_500,
  /** Only players active in the last day can be robbed. */
  targetActiveHours: 24,
  /** After any attempt, the target can't be robbed again for this long. */
  victimProtectionMinutes: 60,
  baseChance: 0.4,
  /** Per account level the robber is above (or below) the target. */
  perLevel: 0.015,
  minChance: 0.15,
  maxChance: 0.6,
  /** A guard dog takes this off the robber's chance. */
  guardDog: 0.15,
  /** Share of the target's wallet taken, [min, max]. */
  steal: [0.1, 0.25] as const,
  maxSteal: 50_000,
  /** Failing: a fine (paid to the target), and maybe jail. */
  fineShare: 0.1,
  minFine: 500,
  maxFine: 10_000,
  jailChance: 0.35,
  jailMinutes: 10,
  /** The victim has this long to catch a successful robber. */
  getawaySeconds: 30,
  /** Caught robbers go to jail for this long and pay the fine too. */
  caughtJailMinutes: 15,
} as const;

export const heistRules = {
  minLevel: 10,
  stake: 5_000,
  minCrew: 2,
  maxCrew: 6,
  lobbySeconds: 60,
  cooldownHours: 4,
  /** Success chance by crew size. */
  chance: (crew: number) => Math.min(0.75, 0.3 + 0.09 * crew),
  /** Each member gets their stake back times this on success. */
  payout: 2.2,
  jailChance: 0.4,
  jailMinutes: 15,
} as const;

export const duelRules = {
  minLevel: 3,
  minBet: 100,
  acceptSeconds: 60,
  /** "DRAW!" appears after a random delay in this range. */
  drawDelayMs: [2_000, 5_000] as const,
  /** Nobody clicks within this: both stakes are refunded. */
  drawWindowMs: 10_000,
} as const;

export const tradeRules = {
  idleMinutes: 5,
  maxLinesPerSide: 8,
} as const;

/** Guard dog: protection from robbers while active. */
export const guardDogDays = 3;
export const maxGuardDogDays = 7;

/**
 * Anti-alt rules for give, gift, trade, duel, being robbed and joining a heist.
 * Both sides must pass (except rob/heist, which check the target/joiner).
 */
export const antiAlt = {
  /** Discord account age. */
  minAccountDays: 30,
  /** OctBot profile age. */
  minProfileDays: 3,
} as const;

/** What a player can send to others per UTC day (give, gift, and their side of trades). */
export const dailyGiveLimit = {
  /** Coins: this × account level, capped. */
  coinsPerLevel: 10_000,
  maxCoins: 500_000,
  /** Items (total quantity). */
  items: 20,
} as const;

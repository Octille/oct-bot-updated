/**
 * Core economy numbers. Every tunable value lives in src/content so balancing is a config edit.
 * BALANCE.md explains the intended earning rates these are tuned for.
 */
export const economyConfig = {
  startingWallet: 1_000,

  bank: {
    /** Capacity at account level 0. */
    base: 25_000,
    /** Extra capacity per account level. */
    perLevel: 5_000,
    /** Extra capacity per bank note used. */
    perNote: 10_000,
  },

  /** Fraction of a /give that is destroyed (coin sink). */
  transferTax: 0.05,
} as const;

/** Bank capacity for a given account level and number of bank notes used. */
export function bankCapacity(level: number, bankNotes: number): number {
  const { base, perLevel, perNote } = economyConfig.bank;
  return base + level * perLevel + bankNotes * perNote;
}

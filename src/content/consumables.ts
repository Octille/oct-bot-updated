/** What each consumable does when used. */

export type BoostKind = 'xp' | 'coin' | 'luck';

export const boosts: Record<BoostKind, { label: string; emoji: string; minutes: number; effect: string }> = {
  xp: { label: 'XP Boost', emoji: '⚡', minutes: 30, effect: '2× account XP' },
  coin: { label: 'Coin Boost', emoji: '💰', minutes: 30, effect: '+50% coins from every earning command' },
  luck: { label: 'Luck Potion', emoji: '🍀', minutes: 30, effect: '+2 luck on fish, hunt and dig; double gem chance' },
};

/** Boost strength. */
export const boostEffect = { xpMult: 2, coinMult: 1.5, luckPoints: 2, gemMult: 2 } as const;

/** Using a boost while one is running extends it, up to this many minutes in total. */
export const maxBoostMinutes = 120;

export const consumableUses: Record<string, { kind: 'boost'; boost: BoostKind } | { kind: 'bank_note' } | { kind: 'streak_freeze' } | { kind: 'scratch' } | { kind: 'crate' }> = {
  xp_boost: { kind: 'boost', boost: 'xp' },
  coin_boost: { kind: 'boost', boost: 'coin' },
  luck_potion: { kind: 'boost', boost: 'luck' },
  bank_note: { kind: 'bank_note' },
  streak_freeze: { kind: 'streak_freeze' },
  scratch_card: { kind: 'scratch' },
  crate_common: { kind: 'crate' },
  crate_rare: { kind: 'crate' },
  crate_epic: { kind: 'crate' },
  crate_legendary: { kind: 'crate' },
};

/** Scratch card prizes (price ₪1,000). Expected value ≈ ₪852, so the house keeps about 15%. */
export const scratchPrizes: { weight: number; coins: number }[] = [
  { weight: 62.5, coins: 0 },
  { weight: 20, coins: 1_000 },
  { weight: 10, coins: 2_000 },
  { weight: 5.5, coins: 3_500 },
  { weight: 1.8, coins: 10_000 },
  { weight: 0.2, coins: 40_000 },
];

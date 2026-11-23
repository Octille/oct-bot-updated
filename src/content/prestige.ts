/**
 * Prestige: reach account level `prestigeLevel`, reset your level and coins, and come back stronger.
 * Kept: items, tools, cosmetics, fishdex, achievements, job progress, streaks — and everything you
 * unlocked stays unlocked (gates use your best-ever level).
 */

export const MAX_PRESTIGE = 10;
/** Account level needed to prestige (about 65 active hours the first time). */
export const prestigeLevel = 35;

/** Prestige tokens earned for reaching prestige `p` (spent in the prestige shop). */
export function tokensFor(p: number): number {
  return p >= 5 ? 2 : 1;
}

export const prestigeNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

/** Colour of the prestige marker on cards, by prestige. */
export function prestigeColor(p: number): string {
  if (p >= 10) return '#e74c3c';
  if (p >= 7) return '#f39c12';
  if (p >= 4) return '#9b59b6';
  return '#3498db';
}

export type PerkId = 'deep_pockets' | 'lucky_charm' | 'scholar' | 'golden_touch' | 'deeper_pockets';

/** Permanent perks bought with prestige tokens. Each can be bought once. */
export const perks: readonly { id: PerkId; name: string; cost: number; minPrestige: number; description: string }[] = [
  { id: 'deep_pockets', name: 'Deep Pockets', cost: 1, minPrestige: 1, description: '+25% bank capacity' },
  { id: 'lucky_charm', name: 'Lucky Charm', cost: 1, minPrestige: 1, description: '+1 luck on fishing, hunting, mining and digging' },
  { id: 'scholar', name: 'Scholar', cost: 2, minPrestige: 2, description: '+15% account XP' },
  { id: 'golden_touch', name: 'Golden Touch', cost: 3, minPrestige: 3, description: '+10% coins from every activity' },
  { id: 'deeper_pockets', name: 'Deeper Pockets', cost: 3, minPrestige: 5, description: 'Another +25% bank capacity' },
];

export const perkEffect = {
  bankMult: 0.25,
  luckPoints: 1,
  xpMult: 0.15,
  incomeMult: 0.1,
} as const;

/** Prestige cosmetics (in content/cosmetics.ts), bought with tokens. */
export const prestigeCosmeticCost: Record<string, number> = {
  title_reborn: 1,
  theme_phoenix: 1,
  bg_phoenix: 2,
  title_ascended: 2,
};

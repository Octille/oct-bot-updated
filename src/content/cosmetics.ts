/**
 * Titles, embed colour themes and badges — coin sinks and status symbols.
 * (Profile backgrounds arrive with profile cards in Phase 3.)
 */

export interface Cosmetic {
  id: string;
  kind: 'title' | 'theme' | 'badge';
  name: string;
  /** Titles: text shown next to your name. Themes: embed colour. Badges: icon key. */
  value: string | number;
  price: number;
  /** Only sold in the daily rotation. */
  rotationOnly?: boolean;
  /** Never sold, never tradable, can't be earned after launch (granted by the v2 migration). */
  exclusive?: 'veteran';
}

export const cosmetics: readonly Cosmetic[] = [
  { id: 'title_beggar', kind: 'title', name: 'Professional Beggar', value: 'Professional Beggar', price: 15_000 },
  { id: 'title_rockbottom', kind: 'title', name: 'Rock Bottom', value: 'Rock Bottom', price: 25_000 },
  { id: 'title_angler', kind: 'title', name: 'Fish Whisperer', value: 'Fish Whisperer', price: 50_000 },
  { id: 'title_oct', kind: 'title', name: 'Octopus Enthusiast', value: 'Octopus Enthusiast', price: 100_000 },
  { id: 'title_tycoon', kind: 'title', name: 'Tycoon', value: 'Tycoon', price: 500_000 },
  { id: 'title_lucky', kind: 'title', name: 'Lucky Seven', value: 'Lucky Seven', price: 75_000, rotationOnly: true },
  { id: 'title_collector', kind: 'title', name: 'The Collector', value: 'The Collector', price: 120_000, rotationOnly: true },
  { id: 'theme_ocean', kind: 'theme', name: 'Ocean', value: 0x1e90ff, price: 20_000 },
  { id: 'theme_forest', kind: 'theme', name: 'Forest', value: 0x228b22, price: 20_000 },
  { id: 'theme_sunset', kind: 'theme', name: 'Sunset', value: 0xff7043, price: 40_000 },
  { id: 'theme_neon', kind: 'theme', name: 'Neon', value: 0x39ff14, price: 60_000 },
  { id: 'theme_royal', kind: 'theme', name: 'Royal', value: 0x7b1fa2, price: 80_000 },
  { id: 'theme_aurora', kind: 'theme', name: 'Aurora', value: 0x00e5c8, price: 90_000, rotationOnly: true },
  { id: 'theme_gold', kind: 'theme', name: 'Solid Gold', value: 0xffd700, price: 150_000, rotationOnly: true },

  // Veteran set — players from the original bot. See content/veteran.ts.
  { id: 'title_veteran', kind: 'title', name: 'Veteran', value: 'Veteran', price: 0, exclusive: 'veteran' },
  { id: 'title_elite_veteran', kind: 'title', name: 'Elite Veteran', value: 'Elite Veteran', price: 0, exclusive: 'veteran' },
  { id: 'title_founder', kind: 'title', name: 'Founder', value: 'Founder', price: 0, exclusive: 'veteran' },
  { id: 'badge_veteran', kind: 'badge', name: 'Veteran badge', value: 'badge_veteran', price: 0, exclusive: 'veteran' },
  { id: 'badge_elite', kind: 'badge', name: 'Elite Veteran badge', value: 'badge_elite', price: 0, exclusive: 'veteran' },
  { id: 'badge_founder', kind: 'badge', name: 'Founder badge', value: 'badge_founder', price: 0, exclusive: 'veteran' },
  // The original OctBot purple, a deeper amethyst, and founder gold
  { id: 'theme_veteran', kind: 'theme', name: 'Classic Oct', value: 0x6b32a8, price: 0, exclusive: 'veteran' },
  { id: 'theme_elite', kind: 'theme', name: 'Elite Amethyst', value: 0x8e44ad, price: 0, exclusive: 'veteran' },
  { id: 'theme_founder', kind: 'theme', name: 'Founder Gold', value: 0xaf810e, price: 0, exclusive: 'veteran' },
];

/** Cosmetics anyone can buy (not rotation-only, not exclusive). */
export function shopCosmetics(): Cosmetic[] {
  return cosmetics.filter((c) => !c.rotationOnly && !c.exclusive);
}

export function getCosmetic(id: string): Cosmetic | undefined {
  return cosmetics.find((c) => c.id === id);
}

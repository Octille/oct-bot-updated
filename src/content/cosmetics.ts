/** Titles and embed colour themes — pure coin sinks and status symbols. (Profile backgrounds arrive with profile cards.) */

export interface Cosmetic {
  id: string;
  kind: 'title' | 'theme';
  name: string;
  /** Titles: text shown next to your name. Themes: embed colour. */
  value: string | number;
  price: number;
  /** Only sold in the daily rotation. */
  rotationOnly?: boolean;
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
];

export function getCosmetic(id: string): Cosmetic | undefined {
  return cosmetics.find((c) => c.id === id);
}

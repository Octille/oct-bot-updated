/**
 * Titles, embed colour themes and badges — coin sinks and status symbols.
 * (Profile backgrounds arrive with profile cards in Phase 3.)
 */

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  /**
   * Titles: text shown next to your name. Themes: embed colour. Badges: icon key.
   * Backgrounds: card gradient "#top,#bottom". Frames: avatar ring colour "#hex" (or "#a,#b" for a gradient ring).
   */
  value: string | number;
  price: number;
  /** Only sold in the daily rotation. */
  rotationOnly?: boolean;
  /**
   * Not in the coin shop:
   *   veteran     — granted by the v2 migration only; can't be earned after launch
   *   achievement — the reward for an achievement
   *   prestige    — bought with prestige tokens
   *   creator     — the bot's creator only (OWNER_ID); never sold, earned or given to anyone else
   */
  exclusive?: 'veteran' | 'achievement' | 'prestige' | 'season' | 'creator';
  /** Prestige needed before it shows up in the prestige shop. */
  minPrestige?: number;
}

export type CosmeticKind = 'title' | 'theme' | 'badge' | 'background' | 'frame';

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

  // Card backgrounds (rank and profile cards)
  { id: 'bg_midnight', kind: 'background', name: 'Midnight', value: '#1f2340,#0b0d1a', price: 25_000 },
  { id: 'bg_ocean', kind: 'background', name: 'Ocean Depths', value: '#0f4c75,#06202f', price: 40_000 },
  { id: 'bg_forest', kind: 'background', name: 'Deep Forest', value: '#1e5631,#0b2012', price: 40_000 },
  { id: 'bg_sunset', kind: 'background', name: 'Sunset', value: '#ff7e5f,#4a1942', price: 75_000 },
  { id: 'bg_ember', kind: 'background', name: 'Ember', value: '#c0392b,#2c0b0b', price: 100_000 },
  { id: 'bg_aurora', kind: 'background', name: 'Aurora', value: '#00c9a7,#1b1464', price: 150_000, rotationOnly: true },

  // Achievement rewards (see content/achievements.ts)
  { id: 'title_light_fingers', kind: 'title', name: 'Light Fingers', value: 'Light Fingers', price: 0, exclusive: 'achievement' },
  { id: 'title_master_hacker', kind: 'title', name: 'Master Hacker', value: 'Master Hacker', price: 0, exclusive: 'achievement' },
  { id: 'title_art_thief', kind: 'title', name: 'Art Thief', value: 'Art Thief', price: 0, exclusive: 'achievement' },
  { id: 'title_repeat_offender', kind: 'title', name: 'Repeat Offender', value: 'Repeat Offender', price: 0, exclusive: 'achievement' },
  { id: 'title_old_salt', kind: 'title', name: 'Old Salt', value: 'Old Salt', price: 0, exclusive: 'achievement' },
  { id: 'title_deep_delver', kind: 'title', name: 'Deep Delver', value: 'Deep Delver', price: 0, exclusive: 'achievement' },
  { id: 'title_big_game', kind: 'title', name: 'Big Game Hunter', value: 'Big Game Hunter', price: 0, exclusive: 'achievement' },
  { id: 'title_treasure_hunter', kind: 'title', name: 'Treasure Hunter', value: 'Treasure Hunter', price: 0, exclusive: 'achievement' },
  { id: 'title_workaholic', kind: 'title', name: 'Workaholic', value: 'Workaholic', price: 0, exclusive: 'achievement' },
  { id: 'title_dedicated', kind: 'title', name: 'Dedicated', value: 'Dedicated', price: 0, exclusive: 'achievement' },
  { id: 'title_chatterbox', kind: 'title', name: 'Chatterbox', value: 'Chatterbox', price: 0, exclusive: 'achievement' },
  { id: 'title_completionist', kind: 'title', name: 'Completionist', value: 'Completionist', price: 0, exclusive: 'achievement' },
  { id: 'bg_abyss', kind: 'background', name: 'Abyss', value: '#123c69,#000814', price: 0, exclusive: 'achievement' },

  // Prestige shop (bought with prestige tokens; see content/prestige.ts)
  { id: 'title_reborn', kind: 'title', name: 'Reborn', value: 'Reborn', price: 0, exclusive: 'prestige', minPrestige: 1 },
  { id: 'theme_phoenix', kind: 'theme', name: 'Phoenix', value: 0xe25822, price: 0, exclusive: 'prestige', minPrestige: 1 },
  { id: 'bg_phoenix', kind: 'background', name: 'Phoenix', value: '#f39c12,#6e1a0a', price: 0, exclusive: 'prestige', minPrestige: 3 },
  { id: 'title_ascended', kind: 'title', name: 'Ascended', value: 'Ascended', price: 0, exclusive: 'prestige', minPrestige: 5 },

  // Season rewards (see content/events.ts)
  { id: 'badge_season_champion', kind: 'badge', name: 'Season Champion', value: 'season_gold', price: 0, exclusive: 'season' },
  { id: 'badge_season_top10', kind: 'badge', name: 'Season Top 10', value: 'season_top10', price: 0, exclusive: 'season' },
  { id: 'badge_season_top100', kind: 'badge', name: 'Season Top 100', value: 'season_top100', price: 0, exclusive: 'season' },

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
  // Rank card frames (avatar ring)
  { id: 'frame_veteran', kind: 'frame', name: 'Veteran frame', value: '#6066ae,#7f83be', price: 0, exclusive: 'veteran' },
  { id: 'frame_elite', kind: 'frame', name: 'Elite Veteran frame', value: '#8e44ad,#c39bd3', price: 0, exclusive: 'veteran' },
  { id: 'frame_founder', kind: 'frame', name: 'Founder frame', value: '#af810e,#f7dc6f', price: 0, exclusive: 'veteran' },

  // Creator set — OctBot's creator only (OWNER_ID). See creatorCosmetics below.
  { id: 'title_creator', kind: 'title', name: 'Creator', value: 'Creator', price: 0, exclusive: 'creator' },
  { id: 'badge_creator', kind: 'badge', name: 'Creator badge', value: 'badge_creator', price: 0, exclusive: 'creator' },
];

/** Cosmetics anyone can buy (not rotation-only, not exclusive). */
export function shopCosmetics(): Cosmetic[] {
  return cosmetics.filter((c) => !c.rotationOnly && !c.exclusive);
}

export function getCosmetic(id: string): Cosmetic | undefined {
  return cosmetics.find((c) => c.id === id);
}

/** The creator's own title and badge (exclusive: 'creator'). */
export const creatorCosmetics = cosmetics.filter((c) => c.exclusive === 'creator').map((c) => c.id);

/** Whether this player may own (and equip) a cosmetic: creator cosmetics belong to OWNER_ID alone. */
export function mayOwnCosmetic(id: string, userId: string, ownerId: string): boolean {
  return cosmetics.find((c) => c.id === id)?.exclusive !== 'creator' || userId === ownerId;
}

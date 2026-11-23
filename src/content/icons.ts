import { rarityInfo, type Rarity } from './rarity';

/**
 * OctBot's icon set: Tabler Icons (MIT, https://tabler.io/icons), outline style, stroke 2.5,
 * rendered to 64×64 PNGs and uploaded as application emojis (scripts/icons/build.ts + sync.ts).
 * Every screen asks for icons by key; if an icon isn't uploaded, the fallback emoji is shown.
 */

/** Lighter OctBot purple: 3.56:1 on light mode, 3.55:1 on dark mode. */
export const ICON_COLOR = '#a272d5';
export const ICON_STROKE = 2.5;

export interface IconDef {
  /** Tabler outline icon name. */
  tabler: string;
  /** Standard emoji shown if the application emoji is missing. */
  fallback: string;
  /** Overrides ICON_COLOR (only rarity icons use this). */
  color?: string;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const rarity = (r: Rarity, tabler: string, fallback: string): IconDef => ({ tabler, fallback, color: hex(rarityInfo[r].color) });

export const iconDefs = {
  // Money
  currency: { tabler: 'coins', fallback: '🪙' },
  wallet: { tabler: 'wallet', fallback: '👛' },
  bank: { tabler: 'building-bank', fallback: '🏦' },
  // Screen roots
  menu: { tabler: 'layout-grid', fallback: '🏠' },
  shop: { tabler: 'building-store', fallback: '🛒' },
  inventory: { tabler: 'backpack', fallback: '🎒' },
  jobs: { tabler: 'briefcase', fallback: '💼' },
  wardrobe: { tabler: 'shirt', fallback: '🎨' },
  fishdex: { tabler: 'book', fallback: '📘' },
  help: { tabler: 'help', fallback: '📖' },
  jail: { tabler: 'gavel', fallback: '🚔' },
  // Activities
  daily: { tabler: 'calendar-check', fallback: '☀️' },
  weekly: { tabler: 'calendar-week', fallback: '📦' },
  work: { tabler: 'briefcase', fallback: '💼' },
  mine: { tabler: 'pick', fallback: '⛏️' },
  fish: { tabler: 'fish-hook', fallback: '🎣' },
  hunt: { tabler: 'bow', fallback: '🏹' },
  dig: { tabler: 'shovel', fallback: '🪏' },
  search: { tabler: 'search', fallback: '🔍' },
  beg: { tabler: 'heart-handshake', fallback: '🙏' },
  crime: { tabler: 'spy', fallback: '🦹' },
  // Rarity (tinted; shapes also differ so they work without colour)
  // Common's grey is darkened a little so it stays visible on light mode
  common: { tabler: 'circle', fallback: '⚪', color: '#7f8c8d' },
  uncommon: rarity('uncommon', 'triangle', '🟢'),
  rare: rarity('rare', 'square', '🔵'),
  epic: rarity('epic', 'pentagon', '🟣'),
  legendary: rarity('legendary', 'hexagon', '🟠'),
  mythic: rarity('mythic', 'star', '🔴'),
  // Status
  success: { tabler: 'circle-check', fallback: '✅' },
  warning: { tabler: 'alert-triangle', fallback: '⚠️' },
  error: { tabler: 'circle-x', fallback: '❌' },
  locked: { tabler: 'lock', fallback: '🔒' },
  cooldown: { tabler: 'hourglass', fallback: '⏳' },
} satisfies Record<string, IconDef>;

export type IconKey = keyof typeof iconDefs;

/** Application emoji names: `oi_<key>_<hash>`, so changed icons are re-uploaded under a new name. */
export const EMOJI_PREFIX = 'oi_';

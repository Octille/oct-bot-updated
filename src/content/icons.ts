import { rarityInfo, type Rarity } from './rarity';

/**
 * OctBot's icon set: Tabler Icons (MIT, https://tabler.io/icons), outline style, stroke 2.5,
 * rendered to 64×64 PNGs and uploaded as application emojis (scripts/icons/build.ts + sync.ts).
 * Every screen asks for icons by key; if an icon isn't uploaded, the fallback emoji is shown.
 */

/** OctBot's brand colour (the blue in the avatar): embed side colour on every screen. */
export const BRAND = 0x6066ae;

/**
 * Icon colour variants. Each icon is rendered once per variant (except fixed-colour icons):
 *   brand — screen title icons only (lighter brand blue: 3.56:1 on light, 3.55:1 on dark)
 *   white — on green/blue buttons only, where the label is white too
 *   grey  — inline in embed text (Discord's muted text colour)
 */
export const ICON_VARIANTS = { brand: '#7f83be', white: '#ffffff', grey: '#80848e' } as const;
export type IconVariant = keyof typeof ICON_VARIANTS;
/** One-letter variant codes used in application emoji names. */
export const VARIANT_CODE: Record<IconVariant | 'fixed', string> = { brand: 'b', white: 'w', grey: 'g', fixed: 'c' };
export const ICON_STROKE = 2.5;

export interface IconDef {
  /** Tabler outline icon name. */
  tabler: string;
  /** Standard emoji shown if the application emoji is missing. */
  fallback: string;
  /** A fixed colour (rarity, badges): rendered once, used everywhere instead of the variants. */
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
  achievements: { tabler: 'trophy', fallback: '🏆' },
  prestige: { tabler: 'flame', fallback: '🔥' },
  rank: { tabler: 'chart-bar', fallback: '📊' },
  profile: { tabler: 'id-badge-2', fallback: '🪪' },
  casino: { tabler: 'cards', fallback: '🃏' },
  coinflip: { tabler: 'coin', fallback: '🪙' },
  slots: { tabler: 'cherry', fallback: '🎰' },
  blackjack: { tabler: 'poker-chip', fallback: '🂡' },
  highlow: { tabler: 'arrows-up-down', fallback: '↕️' },
  roulette: { tabler: 'diamond', fallback: '🎡' },
  crash: { tabler: 'rocket', fallback: '🚀' },
  rob: { tabler: 'run', fallback: '🏃' },
  heist: { tabler: 'lock-open', fallback: '🔓' },
  duel: { tabler: 'swords', fallback: '⚔️' },
  trade: { tabler: 'arrows-exchange', fallback: '🔁' },
  give: { tabler: 'gift', fallback: '🎁' },
  // Veteran badges (exclusive, see content/veteran.ts)
  badge_veteran: { tabler: 'shield', fallback: '🛡️', color: '#7f83be' },
  badge_elite: { tabler: 'shield-star', fallback: '🎖️', color: '#7f83be' },
  // Founder gold: 3.52:1 on light mode, 3.59:1 on dark mode
  badge_founder: { tabler: 'crown', fallback: '👑', color: '#af810e' },
  // Status
  success: { tabler: 'circle-check', fallback: '✅' },
  warning: { tabler: 'alert-triangle', fallback: '⚠️' },
  error: { tabler: 'circle-x', fallback: '❌' },
  locked: { tabler: 'lock', fallback: '🔒' },
  cooldown: { tabler: 'hourglass', fallback: '⏳' },
} satisfies Record<string, IconDef>;

export type IconKey = keyof typeof iconDefs;

/** Application emoji names: `oi_<key>_<variant>_<hash>`, so changed icons are re-uploaded under a new name. */
export const EMOJI_PREFIX = 'oi_';

/** Every (key, variant) image the set needs: fixed-colour icons once, the rest in each variant. */
export interface IconImage {
  key: IconKey;
  variant: IconVariant | 'fixed';
  color: string;
}

export function iconImages(): IconImage[] {
  return (Object.entries(iconDefs) as [IconKey, IconDef][]).flatMap(([key, def]): IconImage[] =>
    def.color
      ? [{ key, variant: 'fixed', color: def.color }]
      : (Object.keys(ICON_VARIANTS) as IconVariant[]).map((variant) => ({ key, variant, color: ICON_VARIANTS[variant] })));
}

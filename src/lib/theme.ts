import { getCosmetic } from '../content/cosmetics';
import { BRAND } from '../content/icons';
import { prestigeColor, prestigeNumerals } from '../content/prestige';
import type { CardStyle } from './cards';
import { icon } from './icons';
import type { IconKey } from '../content/icons';
import type { Profile } from '../services/economy';

type CosmeticSource = Partial<Pick<Profile, 'cosmetics'>>;

/** Embed colour from the user's equipped theme, if any. */
export function themeColor(profile: CosmeticSource): number | null {
  const theme = profile.cosmetics?.theme ? getCosmetic(profile.cosmetics.theme) : undefined;
  return typeof theme?.value === 'number' ? theme.value : null;
}

/** The equipped badge's icon, or '' if none. */
export function badgeIcon(profile: CosmeticSource): string {
  const badge = profile.cosmetics?.badge ? getCosmetic(profile.cosmetics.badge) : undefined;
  return badge?.kind === 'badge' ? icon(badge.value as IconKey) : '';
}

/** "<badge> Name • Title" with whatever is equipped. */
export function titled(name: string, profile: CosmeticSource): string {
  const title = profile.cosmetics?.title ? getCosmetic(profile.cosmetics.title) : undefined;
  const badge = badgeIcon(profile);
  return `${badge ? `${badge} ` : ''}${title ? `${name} • ${title.value}` : name}`;
}

/** Card colours and decorations from what the player has equipped. */
export function cardStyle(profile: CosmeticSource): CardStyle {
  const pick = (id: string | null | undefined) => (id ? getCosmetic(id) : undefined);
  const bg = pick(profile.cosmetics?.background);
  const frame = pick(profile.cosmetics?.frame);
  const badge = pick(profile.cosmetics?.badge);
  const theme = themeColor(profile);
  return {
    background: bg?.kind === 'background' ? String(bg.value) : null,
    frame: frame?.kind === 'frame' ? String(frame.value) : null,
    accent: `#${(theme ?? BRAND).toString(16).padStart(6, '0')}`,
    badge: badge?.kind === 'badge' ? String(badge.value) : null,
  };
}

/** Prestige marker for cards, or null below prestige 1. */
export function prestigeTag(prestige: number): { value: number; label: string; color: string } | null {
  return prestige > 0 ? { value: prestige, label: prestigeNumerals[prestige] ?? String(prestige), color: prestigeColor(prestige) } : null;
}

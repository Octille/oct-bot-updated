import { getCosmetic } from '../content/cosmetics';
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

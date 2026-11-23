import { getCosmetic } from '../content/cosmetics';
import type { Profile } from '../services/economy';

type CosmeticSource = Partial<Pick<Profile, 'cosmetics'>>;

/** Embed colour from the user's equipped theme, if any. */
export function themeColor(profile: CosmeticSource): number | null {
  const theme = profile.cosmetics?.theme ? getCosmetic(profile.cosmetics.theme) : undefined;
  return typeof theme?.value === 'number' ? theme.value : null;
}

/** "Name • Title" when a title is equipped. */
export function titled(name: string, profile: CosmeticSource): string {
  const title = profile.cosmetics?.title ? getCosmetic(profile.cosmetics.title) : undefined;
  return title ? `${name} • ${title.value}` : name;
}

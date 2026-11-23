import { achievements, type Achievement } from '../content/achievements';
import { getCosmetic } from '../content/cosmetics';
import { itemName } from '../content/items';
import { coins } from '../lib/format';
import { icon } from '../lib/icons';
import { EconomyError } from '../lib/errors';
import { apply, getProfile, type Profile } from './economy';

export function unlockedAt(profile: Pick<Profile, 'achievements'>, id: string): Date | null {
  return ((profile.achievements ?? {}) as Record<string, Date>)[id] ?? null;
}

/**
 * Unlocks every achievement the player now qualifies for and pays its reward.
 * Each unlock is one conditional update (`achievements.<id>` must not exist yet), so concurrent
 * callers can't pay twice. Returns the newly unlocked ones.
 */
export async function checkAchievements(userId: string, profile?: Profile): Promise<Achievement[]> {
  const p = profile ?? await getProfile(userId);
  const due = achievements.filter((a) => !unlockedAt(p, a.id) && a.progress(p) >= a.goal);
  const unlocked: Achievement[] = [];
  for (const a of due) {
    try {
      await apply(userId, {
        wallet: a.reward.coins,
        items: a.reward.item ? { [a.reward.item]: 1 } : undefined,
        addToSet: a.reward.cosmetic ? { 'cosmetics.owned': [a.reward.cosmetic] } : undefined,
        set: { [`achievements.${a.id}`]: new Date() },
        where: { [`achievements.${a.id}`]: { $exists: false } },
      }, { source: 'achievement', meta: { id: a.id } });
      unlocked.push(a);
    } catch (err) {
      if (!(err instanceof EconomyError)) throw err; // someone else unlocked it first
    }
  }
  return unlocked;
}

export function rewardText(a: Achievement): string {
  const parts = [
    a.reward.coins ? coins(a.reward.coins) : null,
    a.reward.item ? itemName(a.reward.item) : null,
    a.reward.cosmetic ? `${getCosmetic(a.reward.cosmetic)?.kind === 'background' ? 'card background' : 'title'} "${getCosmetic(a.reward.cosmetic)?.name}"` : null,
  ];
  return parts.filter(Boolean).join(' + ');
}

/** Short lines for a result screen. At most three are listed, so a big batch doesn't flood it. */
export function achievementText(list: Achievement[]): string | null {
  if (!list.length) return null;
  const shown = list.slice(0, 3).map((a) => `${icon('success')} **Achievement: ${a.name}** · ${rewardText(a)}`);
  if (list.length > 3) shown.push(`…and ${list.length - 3} more. See \`/achievements\`.`);
  return shown.join('\n');
}

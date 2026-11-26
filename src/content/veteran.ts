/**
 * Veteran tiers for players from the original bot (v2 and earlier).
 * Awarded once by the v2 → v3 migration (Phase 7) from old activity — never from balance.
 * Each tier includes the cosmetics of the tiers below it.
 *
 * Thresholds were proposed from a read-only look at the live data (Nov 2026):
 *   445 Veteran · 64 Elite Veteran · 23 Founder (out of 77,801 old profiles, most never played).
 */

export type VeteranTier = 'veteran' | 'elite' | 'founder';
export const veteranTiers: readonly VeteranTier[] = ['veteran', 'elite', 'founder'];

export const veteranInfo: Record<VeteranTier, { label: string; title: string; badge: string; theme: string; frame: string; blurb: string }> = {
  veteran: { label: 'Veteran', title: 'title_veteran', badge: 'badge_veteran', theme: 'theme_veteran', frame: 'frame_veteran', blurb: 'You played the original OctBot.' },
  elite: { label: 'Elite Veteran', title: 'title_elite_veteran', badge: 'badge_elite', theme: 'theme_elite', frame: 'frame_elite', blurb: 'You were one of the original bot\'s most active players.' },
  founder: { label: 'Founder', title: 'title_founder', badge: 'badge_founder', theme: 'theme_founder', frame: 'frame_founder', blurb: 'You were there from the very start.' },
};

export const veteranThresholds = {
  veteran: {
    /** 2021–22 profiles: at least this many command uses (entries in `commands_cooldowns`, repeats count)… */
    minCommands: 2,
    /** …or any of these signs of play: items beyond the starting Shirt and Pants, company workers or miners, a claimed top.gg vote. */
    otherSignals: ['items', 'workers', 'voted'] as const,
    /** 2026 profiles (the April 2026 relaunch): XP earned, mining, cooldowns used or items. */
  },
  elite: { minCommands: 8 },
  founder: {
    /** Joined before this date (first months of tracked activity)… */
    joinedBefore: '2021-06-01',
    /** …and used at least this many different commands. */
    minCommands: 5,
  },
  /** Balances above this (or negative) count as corrupt/exploited: base Veteran only. */
  corruptAbove: 15_400_000,
} as const;

/** Every cosmetic a tier unlocks, including lower tiers'. */
export function veteranCosmetics(tier: VeteranTier): string[] {
  const upTo = veteranTiers.slice(0, veteranTiers.indexOf(tier) + 1);
  return upTo.flatMap((t) => [veteranInfo[t].title, veteranInfo[t].badge, veteranInfo[t].theme, veteranInfo[t].frame]);
}

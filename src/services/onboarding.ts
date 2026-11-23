import { starterRod } from '../content/tools';
import { EconomyError } from '../lib/errors';
import { apply, type Profile } from './economy';

export const ONBOARDING_REWARD = 'crate_common';

export interface Step {
  label: string;
  done: boolean;
  /** Where to go to do it: an activity or a menu screen. */
  target: { activity: 'daily' | 'work' } | { screen: string };
}

export function firstSteps(profile: Profile): Step[] {
  const t = profile.tools;
  const boughtTool = !!(t?.pickaxe?.id || t?.weapon?.id || t?.shovel?.id || (t?.rod?.id && t.rod.id !== starterRod));
  return [
    { label: 'Claim your daily reward', done: !!profile.streak?.lastDaily, target: { activity: 'daily' } },
    { label: 'Work a shift', done: (profile.stats?.worked ?? 0) > 0, target: { activity: 'work' } },
    { label: 'Buy your first tool', done: boughtTool, target: { screen: 'shop.tools' } },
  ];
}

export function onboardingVisible(profile: Profile): boolean {
  return !profile.onboarding?.crateClaimed;
}

/** Gives the First steps crate once all steps are done. Returns true if it was given now. */
export async function claimOnboardingReward(profile: Profile): Promise<boolean> {
  if (profile.onboarding?.crateClaimed || !firstSteps(profile).every((s) => s.done)) return false;
  try {
    await apply(profile._id, {
      items: { [ONBOARDING_REWARD]: 1 },
      set: { 'onboarding.crateClaimed': true },
      where: { 'onboarding.crateClaimed': { $ne: true } },
    }, { source: 'onboarding' });
    return true;
  } catch (err) {
    if (err instanceof EconomyError && err.code === 'CONFLICT') return false; // already claimed elsewhere
    throw err;
  }
}

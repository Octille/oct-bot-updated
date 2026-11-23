import { getProfile } from '../services/economy';
import { claimOnboardingReward } from '../services/onboarding';
import { itemName } from '../content/items';
import { buttonIcon, icon } from '../lib/icons';
import type { IconKey } from '../content/icons';
import { activities, nextReady, statusOf, type ActivityId } from './activities';
import { btn, ids, MAIN, NAV, row, type Row } from './kit';
import { duration } from '../lib/format';
import { achievementText, checkAchievements } from '../services/achievements';

export interface AfterAction {
  /** [Menu] [next ready activity] [this activity again]. */
  row: Row;
  /** Set when finishing this action completed the First steps checklist. */
  note: string | null;
}

/** The next-step row shown under every activity result. */
export async function afterAction(userId: string, current: ActivityId): Promise<AfterAction> {
  let profile = await getProfile(userId);
  let note: string | null = null;
  if (await claimOnboardingReward(profile)) {
    note = `${icon('success')} **First steps complete!** You got a free ${itemName('crate_common')}. Open it from your inventory.`;
    profile = await getProfile(userId);
  }
  const unlocked = achievementText(await checkAchievements(userId, profile));
  if (unlocked) note = [note, unlocked].filter(Boolean).join('\n');

  const now = new Date();
  const buttons = [btn(ids.go(userId, 'menu'), 'Menu', NAV)];
  const next = nextReady(profile, current, now);
  if (next) {
    const a = activities.find((x) => x.id === next)!;
    buttons.push(btn(ids.go(userId, a.id), a.ready, MAIN, { emoji: buttonIcon(a.id as IconKey) }));
  }
  const self = activities.find((x) => x.id === current)!;
  const status = statusOf(current, profile, now);
  if (status.state === 'ready') buttons.push(btn(ids.go(userId, current), `${self.name} again`, NAV));
  else if (status.state === 'cooldown') {
    buttons.push(btn(ids.go(userId, current), `${self.name} again · ${duration(status.readyAt.getTime() - now.getTime())}`, NAV, { disabled: true }));
  }
  return { row: row(...buttons), note };
}

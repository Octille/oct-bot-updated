import { getProfile } from '../services/economy';
import { claimOnboardingReward } from '../services/onboarding';
import { itemLabel } from '../content/items';
import { activities, nextReady, statusOf, type ActivityId } from './activities';
import { btn, ids, MAIN, NAV, row, type Row } from './kit';
import { duration } from '../lib/format';

export interface AfterAction {
  /** [🏠 Menu] [▶ next ready activity] [this activity again]. */
  row: Row;
  /** Set when finishing this action completed the First steps checklist. */
  note: string | null;
}

/** The next-step row shown under every activity result. */
export async function afterAction(userId: string, current: ActivityId): Promise<AfterAction> {
  let profile = await getProfile(userId);
  let note: string | null = null;
  if (await claimOnboardingReward(profile)) {
    note = `🎉 **First steps complete!** You got a ${itemLabel('crate_common')}. Open it from \`/inventory\`.`;
    profile = await getProfile(userId);
  }

  const now = new Date();
  const buttons = [btn(ids.go(userId, 'menu'), 'Menu', NAV, { emoji: '🏠' })];
  const next = nextReady(profile, current, now);
  if (next) {
    const a = activities.find((x) => x.id === next)!;
    buttons.push(btn(ids.go(userId, a.id), a.ready, MAIN, { emoji: a.emoji }));
  }
  const self = activities.find((x) => x.id === current)!;
  const status = statusOf(current, profile, now);
  if (status.state === 'ready') buttons.push(btn(ids.go(userId, current), `${self.name} again`, MAIN, { emoji: self.emoji }));
  else if (status.state === 'cooldown') {
    buttons.push(btn(ids.go(userId, current), `${self.name} again — ${duration(status.readyAt.getTime() - now.getTime())}`, NAV, { emoji: self.emoji, disabled: true }));
  }
  return { row: row(...buttons), note };
}

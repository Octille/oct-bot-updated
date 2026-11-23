import { achievementActivity, achievementById } from '../content/achievements';
import { hourly, type Scenario } from '../game/balance';
import { shiftsIn } from '../game/jobs';
import { rods } from '../content/tools';
import { unlockedAt } from '../services/achievements';
import type { Profile } from '../services/economy';
import { unlockLevel } from '../services/progression';
import { activities, type ActivityId } from './activities';

/** An achievement this close to done (share of its goal) makes its activity the suggestion. */
const NEARLY_DONE = 0.9;

/** The ready activity closest to finishing an achievement, if any is within reach. */
function nearAchievement(p: Profile, ready: ActivityId[]): ActivityId | null {
  let best: { id: ActivityId; ratio: number } | null = null;
  for (const [achId, activity] of Object.entries(achievementActivity)) {
    if (!ready.includes(activity as ActivityId) || unlockedAt(p, achId)) continue;
    const a = achievementById.get(achId);
    if (!a || a.hidden) continue;
    const ratio = a.progress(p) / a.goal;
    if (ratio >= NEARLY_DONE && ratio < 1 && (!best || ratio > best.ratio)) best = { id: activity as ActivityId, ratio };
  }
  return best?.id ?? null;
}

/** Expected coins per use of each timed activity, from the balance model with this player's job and tools. */
export function coinsPerUse(p: Profile): Partial<Record<ActivityId, number>> {
  const job = p.job?.current ?? 'barista';
  const scenario: Scenario = {
    name: 'player',
    level: unlockLevel(p),
    job,
    shifts: shiftsIn(p.job?.shifts as Record<string, number> | undefined, job),
    pickaxe: p.tools?.pickaxe?.id ?? null,
    rod: p.tools?.rod?.id ?? rods[0]!.id,
    weapon: p.tools?.weapon?.id ?? null,
    shovel: p.tools?.shovel?.id ?? null,
  };
  const h = hourly(scenario);
  const out: Partial<Record<ActivityId, number>> = {};
  for (const a of activities) {
    if (!('cooldown' in a)) continue;
    const perHour = h[a.id as keyof typeof h];
    if (typeof perHour === 'number') out[a.id] = perHour / (3600 / a.cooldown);
  }
  return out;
}

/**
 * The one ready activity to highlight: whatever finishes an achievement soon, then a daily/weekly
 * claim, then the best-paying ready activity. Quests join this in Phase 5.
 */
export function suggestedActivity(p: Profile, ready: ActivityId[]): ActivityId | null {
  if (!ready.length) return null;
  const near = nearAchievement(p, ready);
  if (near) return near;
  for (const claim of ['daily', 'weekly'] as const) if (ready.includes(claim)) return claim;
  try {
    const value = coinsPerUse(p);
    return [...ready].sort((a, b) => (value[b] ?? 0) - (value[a] ?? 0))[0]!;
  } catch {
    return ready[0]!; // unknown tool/job id: fall back to display order
  }
}

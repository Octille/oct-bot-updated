import { cooldowns, moreCooldowns } from '../content/earning';
import { crimeUnlockLevel } from '../content/crime';
import { duration } from '../lib/format';
import { icon } from '../lib/icons';
import { dayNumber } from '../game/streaks';
import { isJailed } from '../services/jail';
import { equipped } from '../services/tools';
import type { Profile } from '../services/economy';
import type { ToolSlot } from '../content/tools';

/** Everything the hub can start, in display order. `command` is the slash command it runs. */
export const activities = [
  { id: 'daily', name: 'Daily', ready: 'Claim Daily', command: 'daily' },
  { id: 'weekly', name: 'Weekly', ready: 'Claim Weekly', command: 'weekly' },
  { id: 'work', name: 'Work', ready: 'Work', command: 'work', cooldown: cooldowns.work },
  { id: 'mine', name: 'Mine', ready: 'Mine', command: 'mine', cooldown: cooldowns.mine },
  { id: 'fish', name: 'Fish', ready: 'Fish', command: 'fish', cooldown: cooldowns.fish, tool: 'rod' },
  { id: 'beg', name: 'Beg', ready: 'Beg', command: 'beg', cooldown: cooldowns.beg },
  { id: 'search', name: 'Search', ready: 'Search', command: 'search', cooldown: cooldowns.search },
  { id: 'hunt', name: 'Hunt', ready: 'Hunt', command: 'hunt', cooldown: moreCooldowns.hunt, tool: 'weapon', toolName: 'Slingshot' },
  { id: 'dig', name: 'Dig', ready: 'Dig', command: 'dig', cooldown: moreCooldowns.dig, tool: 'shovel', toolName: 'Trowel' },
  { id: 'crime', name: 'Crime', ready: 'Crime', command: 'crime', cooldown: moreCooldowns.crime, level: crimeUnlockLevel },
] as const satisfies readonly {
  id: string; name: string; ready: string; command: string;
  cooldown?: number; tool?: ToolSlot; toolName?: string; level?: number;
}[];

export type ActivityId = (typeof activities)[number]['id'];

export type Status =
  | { state: 'ready' }
  | { state: 'cooldown'; readyAt: Date }
  /** Can be fixed by going somewhere (buy or repair a tool). */
  | { state: 'needs'; reason: string; label: string; fix: string }
  /** No direct fix (level too low, in jail). */
  | { state: 'locked'; reason: string; label: string };

const DAY = 86_400_000;

export function statusOf(id: ActivityId, profile: Profile, now = new Date()): Status {
  const a = activities.find((x) => x.id === id)!;
  if (isJailed(profile.jailUntil, now.getTime())) {
    return { state: 'locked', reason: 'In jail', label: 'In jail' };
  }
  if ('level' in a && (profile.account?.level ?? 0) < a.level) {
    return { state: 'locked', reason: `Level ${a.level}`, label: `Level ${a.level}` };
  }
  if ('tool' in a) {
    const eq = equipped(profile, a.tool);
    // The starter rod is handed out on the first /fish, so a missing rod is fine
    if (!eq.tool && a.tool !== 'rod') {
      return { state: 'needs', reason: `Needs a ${a.toolName}`, label: `Get ${a.toolName}`, fix: `shop.tools.${a.tool}` };
    }
    if (eq.broken) return { state: 'needs', reason: `${eq.tool!.name} is broken`, label: `Repair ${eq.tool!.name}`, fix: `shop.tools.${a.tool}` };
  }
  if (id === 'daily') {
    const last = profile.streak?.lastDaily;
    if (last && dayNumber(last) === dayNumber(now)) return { state: 'cooldown', readyAt: new Date((dayNumber(now) + 1) * DAY) };
    return { state: 'ready' };
  }
  if (id === 'weekly') {
    const last = profile.streak?.lastWeekly;
    if (last && now.getTime() - new Date(last).getTime() < 7 * DAY) return { state: 'cooldown', readyAt: new Date(new Date(last).getTime() + 7 * DAY) };
    return { state: 'ready' };
  }
  const until = (profile.cooldowns as Record<string, Date> | undefined)?.[id];
  if (until && new Date(until).getTime() > now.getTime()) return { state: 'cooldown', readyAt: new Date(until) };
  return { state: 'ready' };
}

/** "ready", "<cooldown icon> 4m", "needs a Slingshot", "<locked icon> level 3": icons only on cooldown/locked. */
export function statusText(status: Status, now = new Date()): string {
  switch (status.state) {
    case 'ready': return '**ready**';
    case 'cooldown': return `${icon('cooldown')} ${duration(status.readyAt.getTime() - now.getTime())}`;
    case 'needs': return status.reason.toLowerCase();
    case 'locked': return `${icon('locked')} ${status.reason.toLowerCase()}`;
  }
}

/** The first ready activity, preferring ones other than `except`. */
export function nextReady(profile: Profile, except?: ActivityId, now = new Date()): ActivityId | null {
  const ready = activities.filter((a) => a.id !== except && statusOf(a.id, profile, now).state === 'ready');
  return ready[0]?.id ?? null;
}

import { daily, dailyMultiplier, weekly } from '../content/earning';

const DAY_MS = 86_400_000;

/** Days since the Unix epoch in UTC; daily rewards reset at 00:00 UTC. */
export function dayNumber(date: Date | number): number {
  return Math.floor(new Date(date).getTime() / DAY_MS);
}

export function nextUtcMidnight(now: Date): Date {
  return new Date((dayNumber(now) + 1) * DAY_MS);
}

export interface DailyState {
  count: number;
  best: number;
  lastDaily: Date | null;
  days: number[];
}

export type DailyClaim =
  | { ok: false; nextAt: Date }
  | {
    ok: true; streak: number; best: number; broken: boolean; multiplier: number; coins: number; milestoneBonus: number; days: number[];
    /** Streak freezes used up to cover missed days. */
    freezesUsed: number;
  };

/**
 * Once per UTC day. Claiming on consecutive days grows the streak; missing a full day resets it,
 * unless you have a streak freeze for every missed day.
 */
export function claimDaily(state: DailyState, now: Date, incomeMult: number, freezes = 0): DailyClaim {
  const today = dayNumber(now);
  const last = state.lastDaily ? dayNumber(state.lastDaily) : null;
  if (last === today) return { ok: false, nextAt: nextUtcMidnight(now) };

  const missed = last === null ? 0 : today - last - 1;
  const freezesUsed = missed > 0 && state.count > 0 && freezes >= missed ? missed : 0;
  const continues = last !== null && (missed === 0 || freezesUsed > 0);
  const streak = continues ? state.count + 1 : 1;
  const multiplier = dailyMultiplier(streak);
  const coins = Math.round(daily.base * multiplier * incomeMult);
  const milestoneBonus = daily.milestones[streak] ?? 0;
  const days = [...state.days.filter((d) => d > today - 60), today];
  return {
    ok: true,
    streak,
    best: Math.max(state.best, streak),
    broken: last !== null && !continues && state.count > 1,
    multiplier,
    coins,
    milestoneBonus,
    days,
    freezesUsed,
  };
}

export interface WeeklyState {
  weeklyCount: number;
  lastWeekly: Date | null;
}

export type WeeklyClaim =
  | { ok: false; nextAt: Date }
  | { ok: true; streak: number; multiplier: number; coins: number };

/** Once every 7 days. Claiming within 14 days of the last one keeps the weekly streak. */
export function claimWeekly(state: WeeklyState, now: Date, incomeMult: number): WeeklyClaim {
  const last = state.lastWeekly?.getTime() ?? null;
  if (last !== null && now.getTime() - last < 7 * DAY_MS) return { ok: false, nextAt: new Date(last + 7 * DAY_MS) };
  const continues = last !== null && now.getTime() - last <= weekly.streakWindowDays * DAY_MS;
  const streak = continues ? state.weeklyCount + 1 : 1;
  const multiplier = Math.min(weekly.maxMultiplier, 1 + (streak - 1) * weekly.perWeekBonus);
  return { ok: true, streak, multiplier, coins: Math.round(weekly.base * multiplier * incomeMult) };
}

/** Two-week calendar: 🟩 claimed, ⬛ missed, 🔲 today (not yet claimed). Oldest first, Monday-aligned rows. */
export function streakCalendar(days: number[], now: Date): string {
  const today = dayNumber(now);
  const claimed = new Set(days);
  // Day 0 (1970-01-01) was a Thursday; shift so rows start on Monday
  const weekday = (today + 3) % 7;
  const start = today - weekday - 7;
  const rows: string[] = [];
  for (let week = 0; week < 2; week++) {
    const cells: string[] = [];
    for (let d = 0; d < 7; d++) {
      const day = start + week * 7 + d;
      if (day > today) cells.push('▫️');
      else if (claimed.has(day)) cells.push('🟩');
      else if (day === today) cells.push('🔲');
      else cells.push('⬛');
    }
    rows.push(cells.join(''));
  }
  return `\`M  T  W  T  F  S  S\`\n${rows.join('\n')}`;
}

import { reminderRules } from '../content/quests';
import { dayNumber } from '../game/streaks';
import { User } from '../models/User';
import { weekNumber } from './quests';

const DAY = 86_400_000;

export interface DueReminder {
  userId: string;
  kind: 'daily' | 'weekly';
  streak: number;
}

/** The UTC hour to remind at: the hour they picked, else the hour they usually claim their daily. */
export function remindHour(chosen: number | null | undefined, lastDaily: Date | null | undefined): number {
  if (chosen !== null && chosen !== undefined) return chosen;
  return lastDaily ? new Date(lastDaily).getUTCHours() : reminderRules.defaultHour;
}

/**
 * Finds players to remind and marks each reminder as sent first (one conditional update), so a
 * reminder can't go out twice even if two runs overlap. Walks every opted-in player with a cursor
 * (no batch cap, so players whose hour hasn't come can't crowd out the rest).
 *
 * "Not yet reminded" is `{ $not: { $gte: period } }`, which also matches profiles that have no
 * `reminders` field at all (anyone created before reminders existed).
 */
export async function claimDueReminders(now = new Date()): Promise<DueReminder[]> {
  const today = dayNumber(now);
  const week = weekNumber(now);
  const startOfToday = new Date(today * DAY);
  const due: DueReminder[] = [];

  const daily = User.find({
    'settings.dmReminders': true,
    'reminders.dailyDay': { $not: { $gte: today } },
    'streak.lastDaily': { $not: { $gte: startOfToday } },
  }, { streak: 1, 'settings.remindHour': 1 }, { lean: true }).cursor();
  for await (const u of daily) {
    if (now.getUTCHours() < remindHour(u.settings?.remindHour, u.streak?.lastDaily)) continue;
    const res = await User.updateOne({ _id: u._id, 'reminders.dailyDay': { $not: { $gte: today } } }, { $set: { 'reminders.dailyDay': today } });
    if (res.modifiedCount) due.push({ userId: String(u._id), kind: 'daily', streak: u.streak?.count ?? 0 });
  }

  const weekly = User.find({
    'settings.dmReminders': true,
    'reminders.weeklyWeek': { $not: { $gte: week } },
    'streak.lastWeekly': { $not: { $gt: new Date(now.getTime() - 7 * DAY) } },
  }, { _id: 1 }, { lean: true }).cursor();
  for await (const u of weekly) {
    const res = await User.updateOne({ _id: u._id, 'reminders.weeklyWeek': { $not: { $gte: week } } }, { $set: { 'reminders.weeklyWeek': week } });
    if (res.modifiedCount) due.push({ userId: String(u._id), kind: 'weekly', streak: 0 });
  }
  return due;
}

export async function setReminders(userId: string, on: boolean): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { 'settings.dmReminders': on } });
}

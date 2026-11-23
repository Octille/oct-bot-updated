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

/** The UTC hour to remind at: the hour they usually claim, but not before `earliestHour`. */
export function remindHour(lastDaily: Date | null | undefined): number {
  return Math.max(reminderRules.earliestHour, lastDaily ? new Date(lastDaily).getUTCHours() : reminderRules.earliestHour);
}

/**
 * Finds players to remind and marks each reminder as sent first (one conditional update), so a
 * reminder can't go out twice even if two runs overlap.
 */
export async function claimDueReminders(now = new Date(), limit = 500): Promise<DueReminder[]> {
  const today = dayNumber(now);
  const week = weekNumber(now);
  const startOfToday = new Date(today * DAY);
  const due: DueReminder[] = [];

  const daily = await User.find({
    'settings.dmReminders': true,
    'reminders.dailyDay': { $lt: today },
    $or: [{ 'streak.lastDaily': null }, { 'streak.lastDaily': { $lt: startOfToday } }],
  }, { streak: 1 }, { lean: true, limit });
  for (const u of daily) {
    if (now.getUTCHours() < remindHour(u.streak?.lastDaily)) continue;
    const res = await User.updateOne({ _id: u._id, 'reminders.dailyDay': { $lt: today } }, { $set: { 'reminders.dailyDay': today } });
    if (res.modifiedCount) due.push({ userId: String(u._id), kind: 'daily', streak: u.streak?.count ?? 0 });
  }

  const weekly = await User.find({
    'settings.dmReminders': true,
    'reminders.weeklyWeek': { $lt: week },
    $or: [{ 'streak.lastWeekly': null }, { 'streak.lastWeekly': { $lte: new Date(now.getTime() - 7 * DAY) } }],
  }, { _id: 1 }, { lean: true, limit });
  for (const u of weekly) {
    const res = await User.updateOne({ _id: u._id, 'reminders.weeklyWeek': { $lt: week } }, { $set: { 'reminders.weeklyWeek': week } });
    if (res.modifiedCount) due.push({ userId: String(u._id), kind: 'weekly', streak: 0 });
  }
  return due;
}

export async function setReminders(userId: string, on: boolean): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { 'settings.dmReminders': on } });
}

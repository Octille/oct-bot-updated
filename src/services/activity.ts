import { ACTIVITY_SOURCES, seasonRules, type ActivitySource } from '../content/events';
import { logError } from '../lib/logger';
import { CommunityGoal } from '../models/Events';
import { addSeasonPoints } from './seasons';

export function isActivity(source: string): source is ActivitySource {
  return (ACTIVITY_SOURCES as readonly string[]).includes(source);
}

/**
 * Called by grant() after an activity paid out (so abandoned or refunded games never count):
 * a season point, and progress on this server's community goal for that activity.
 */
export async function recordActivity(userId: string, source: ActivitySource, guildId: string | null | undefined, now = new Date()): Promise<void> {
  try {
    await addSeasonPoints(userId, seasonRules.points.activity, now);
    // Credit goes to the server the activity was played in (passed down from the command)
    if (guildId) {
      await CommunityGoal.updateOne(
        { guildId, status: 'active', metric: source, endsAt: { $gt: now } },
        { $inc: { progress: 1, [`contributors.${userId}`]: 1 } },
      );
    }
  } catch (err) {
    logError('record activity', err);
  }
}

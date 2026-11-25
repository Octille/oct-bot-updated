import { ACTIVITY_SOURCES, seasonRules, type ActivitySource } from '../content/events';
import { logError } from '../lib/logger';
import { CommunityGoal } from '../models/Events';
import { addSeasonPoints } from './seasons';

/**
 * Where each player last used the bot. grant() doesn't know the server, and game results arrive
 * from collectors after the command returned, so the router records it here. A game finishes within
 * a minute of its interaction, so this is the right server.
 */
const lastGuild = new Map<string, string | null>();

export function setActiveGuild(userId: string, guildId: string | null): void {
  lastGuild.set(userId, guildId);
  if (lastGuild.size > 100_000) lastGuild.clear();
}

export function isActivity(source: string): source is ActivitySource {
  return (ACTIVITY_SOURCES as readonly string[]).includes(source);
}

/**
 * Called by grant() after an activity paid out (so abandoned or refunded games never count):
 * a season point, and progress on this server's community goal for that activity.
 */
export async function recordActivity(userId: string, source: ActivitySource, now = new Date()): Promise<void> {
  try {
    await addSeasonPoints(userId, seasonRules.points.activity, now);
    const guildId = lastGuild.get(userId);
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

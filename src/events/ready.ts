import { altThresholds } from '../services/antiAlt';
import { antiAlt } from '../content/social';
import { isTestBot } from '../config/env';
import { ActivityType, type Client } from 'discord.js';
import { logInfo } from '../lib/logger';
import { startScheduler } from '../scheduler';
import { jobs } from '../scheduler/jobs';
import { loadIcons } from '../lib/icons';
import { runRobSweep } from '../scheduler/robSweep';
import { refundInterruptedRounds } from '../scheduler/refunds';
import { backfillBoards } from '../services/boardStats';
import { logError } from '../lib/logger';

export async function onReady(client: Client<true>): Promise<void> {
  await loadIcons(client);
  logInfo('ready', `Logged in as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
  const alt = altThresholds();
  if (alt.minAccountDays !== antiAlt.minAccountDays || alt.minProfileDays !== antiAlt.minProfileDays) {
    const weaker = alt.minAccountDays < antiAlt.minAccountDays || alt.minProfileDays < antiAlt.minProfileDays;
    const text = `Anti-alt overridden by env: Discord account ${alt.minAccountDays}d (default ${antiAlt.minAccountDays}), profile ${alt.minProfileDays}d (default ${antiAlt.minProfileDays})`;
    if (weaker && !isTestBot()) logError('anti-alt', new Error(`${text}. This is the REAL bot: remove ANTI_ALT_* from .env.`));
    else logInfo('anti-alt', text);
  }
  client.user.setPresence({ activities: [{ name: '/help', type: ActivityType.Listening }], status: 'online' });
  startScheduler(client, jobs);
  // Leaderboard values for profiles that don't have the current version yet
  backfillBoards().then((n) => n && logInfo('leaderboard', `Computed board values for ${n} profile(s)`)).catch((err) => logError('board backfill', err));
  // Stakes from rounds a restart interrupted
  refundInterruptedRounds(client).catch((err) => logError('refunds', err));
  // Getaways that finished while the bot was offline
  runRobSweep(client).catch((err) => logError('rob sweep', err));
}

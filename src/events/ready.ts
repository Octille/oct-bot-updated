import { ActivityType, type Client } from 'discord.js';
import { logInfo } from '../lib/logger';
import { startScheduler } from '../scheduler';
import { jobs } from '../scheduler/jobs';
import { loadIcons } from '../lib/icons';
import { runRobSweep } from '../scheduler/robSweep';
import { logError } from '../lib/logger';

export async function onReady(client: Client<true>): Promise<void> {
  await loadIcons(client);
  logInfo('ready', `Logged in as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
  client.user.setPresence({ activities: [{ name: '/help', type: ActivityType.Listening }], status: 'online' });
  startScheduler(client, jobs);
  // Getaways that finished while the bot was offline
  runRobSweep(client).catch((err) => logError('rob sweep', err));
}

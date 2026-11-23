import { ActivityType, type Client } from 'discord.js';
import { logInfo } from '../lib/logger';
import { startScheduler } from '../scheduler';
import { jobs } from '../scheduler/jobs';

export function onReady(client: Client<true>): void {
  logInfo('ready', `Logged in as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
  client.user.setPresence({ activities: [{ name: '/help', type: ActivityType.Listening }], status: 'online' });
  startScheduler(client, jobs);
}

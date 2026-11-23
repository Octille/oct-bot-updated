import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDatabase } from './db';
import { attachLogClient, logError } from './lib/logger';
import { routeInteraction } from './framework/router';
import { onReady } from './events/ready';
import { stopScheduler } from './scheduler';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

attachLogClient(client);
client.once(Events.ClientReady, onReady);
client.on(Events.InteractionCreate, (interaction) => {
  routeInteraction(interaction).catch((err) => logError('interaction', err));
});
client.on(Events.Error, (err) => logError('client', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  stopScheduler();
  await client.destroy();
  await mongoose.disconnect();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

// Every feature depends on the database, so don't come online without it.
connectDatabase()
  .then(() => client.login(env.DISCORD_TOKEN))
  .catch((err) => {
    console.error('❌ Startup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });

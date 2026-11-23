import { Client, Events, GatewayIntentBits, Partials, REST, Routes, type APIApplication } from 'discord.js';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDatabase } from './db';
import { attachLogClient, logError } from './lib/logger';
import { routeInteraction } from './framework/router';
import { onReady } from './events/ready';
import { stopScheduler } from './scheduler';
import { onMessageCreate, setMessageContentAvailable } from './events/messageCreate';

/** Application flags for the privileged Message Content intent (enabled, or limited under 100 servers). */
const MESSAGE_CONTENT_FLAGS = (1 << 18) | (1 << 19);

/**
 * Asking for a privileged intent the app doesn't have makes login fail (close code 4014), so
 * check the app's flags first and only request Message Content when it's switched on.
 */
async function hasMessageContent(): Promise<boolean> {
  try {
    const app = (await new REST().setToken(env.DISCORD_TOKEN).get(Routes.currentApplication())) as APIApplication;
    return ((app.flags ?? 0) & MESSAGE_CONTENT_FLAGS) !== 0;
  } catch (err) {
    logError('intents', err);
    return false;
  }
}

function createClient(messageContent: boolean): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      ...(messageContent ? [GatewayIntentBits.MessageContent] : []),
    ],
    partials: [Partials.Channel],
  });
}

let client: Client;
function attachEvents(c: Client): void {
  attachLogClient(c);
  c.once(Events.ClientReady, onReady);
  c.on(Events.InteractionCreate, (interaction) => {
    routeInteraction(interaction).catch((err) => logError('interaction', err));
  });
  c.on(Events.MessageCreate, (message) => void onMessageCreate(message));
  c.on(Events.Error, (err) => logError('client', err));
}
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  stopScheduler();
  await client?.destroy();
  await mongoose.disconnect();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

// Every feature depends on the database, so don't come online without it.
connectDatabase()
  .then(async () => {
    const messageContent = await hasMessageContent();
    setMessageContentAvailable(messageContent);
    if (!messageContent) console.log('[intents] Message Content intent not enabled: chat XP counts every message (once a minute)');
    client = createClient(messageContent);
    attachEvents(client);
    await client.login(env.DISCORD_TOKEN);
  })
  .catch((err) => {
    console.error('❌ Startup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });

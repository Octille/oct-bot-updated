import { Client, Events, GatewayIntentBits, Partials, REST, Routes, type APIApplication } from 'discord.js';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDatabase } from './db';
import { attachLogClient, logError } from './lib/logger';
import { routeInteraction } from './framework/router';
import { onReady } from './events/ready';
import { stopScheduler } from './scheduler';
import { onMessageCreate, setMessageContentAvailable } from './events/messageCreate';

/** Application flags for privileged intents (enabled, or "limited" for bots under 100 servers). */
const MESSAGE_CONTENT_FLAGS = (1 << 18) | (1 << 19);
const GUILD_MEMBERS_FLAGS = (1 << 14) | (1 << 15);

/**
 * Asking for a privileged intent the app doesn't have makes login fail (close code 4014), so
 * check the app's flags first and only request the privileged intents that are switched on.
 */
async function privilegedIntents(): Promise<{ messageContent: boolean; members: boolean }> {
  try {
    const app = (await new REST().setToken(env.DISCORD_TOKEN).get(Routes.currentApplication())) as APIApplication;
    const flags = app.flags ?? 0;
    return { messageContent: (flags & MESSAGE_CONTENT_FLAGS) !== 0, members: (flags & GUILD_MEMBERS_FLAGS) !== 0 };
  } catch (err) {
    logError('intents', err);
    return { messageContent: false, members: false };
  }
}

function createClient({ messageContent, members }: { messageContent: boolean; members: boolean }): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      ...(members ? [GatewayIntentBits.GuildMembers] : []),
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
    const intents = await privilegedIntents();
    setMessageContentAvailable(intents.messageContent);
    if (!intents.messageContent) console.log('[intents] Message Content intent not enabled: chat XP counts every message (once a minute)');
    if (!intents.members) console.log('[intents] Server Members intent not enabled: member lookups fall back to fetching');
    client = createClient(intents);
    attachEvents(client);
    await client.login(env.DISCORD_TOKEN);
  })
  .catch((err) => {
    console.error('❌ Startup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });

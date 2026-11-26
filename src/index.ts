import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDatabase } from './db';
import { attachLogClient, logError } from './lib/logger';
import { routeInteraction } from './framework/router';
import { onReady } from './events/ready';
import { stopScheduler } from './scheduler';
import { onMessageCreate } from './events/messageCreate';
import { checkAlone, createLavalink, notePanelChannelMessage } from './music/manager';
import { onLegacyReaction } from './services/legacyReactionRoles';
import { onGuildCreate, onGuildDelete } from './events/guilds';

/**
 * Only non-privileged intents: OctBot never asks for Server Members, Message Content or Presence.
 * Messages arrive without their text (chat XP and AFK mentions don't need it).
 */
function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      // Reactions on old messages arrive as partials (the original bot's reaction roles)
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
  });
}

let client: Client;
function attachEvents(c: Client): void {
  attachLogClient(c);
  c.once(Events.ClientReady, onReady);
  c.on(Events.InteractionCreate, (interaction) => {
    routeInteraction(interaction).catch((err) => logError('interaction', err));
  });
  c.on(Events.MessageCreate, (message) => {
    notePanelChannelMessage(message.channelId, message.id);
    void onMessageCreate(message);
  });
  c.on(Events.VoiceStateUpdate, (oldState, newState) => {
    for (const s of [oldState, newState]) if (s.guild) checkAlone(c, s.guild.id);
  });
  c.on(Events.MessageReactionAdd, (reaction, user) => void onLegacyReaction(reaction, user, true));
  c.on(Events.MessageReactionRemove, (reaction, user) => void onLegacyReaction(reaction, user, false));
  // Fired only for servers added after startup (the ones at login arrive before ready and aren't logged)
  c.on(Events.GuildCreate, (guild) => { if (c.isReady()) onGuildCreate(guild); });
  c.on(Events.GuildDelete, (guild) => onGuildDelete(guild));
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
    client = createClient();
    attachEvents(client);
    // Music: Lavalink gets gateway events from the start, connects on ready
    createLavalink(client);
    await client.login(env.DISCORD_TOKEN);
  })
  .catch((err) => {
    console.error('❌ Startup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });

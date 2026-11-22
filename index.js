const { Collection, Client, GatewayIntentBits, Partials } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const mongoose = require('mongoose');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
client.events = new Collection();
client.cooldowns = new Collection();

client.lavalink = new LavalinkManager({
  nodes: [{
    authorization: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    host: process.env.LAVALINK_HOST || 'localhost',
    port: Number(process.env.LAVALINK_PORT) || 2333,
    id: 'main-node',
    retryAmount: 20,
    retryDelay: 5000,
  }],
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  },
  client: { id: process.env.CLIENT_ID, username: 'OctBot' },
  defaultSearchPlatform: 'ytmsearch',
  playerOptions: { defaultVolume: 100 },
});

client.on('raw', (data) => client.lavalink.sendRawData(data));

['command_handler', 'event_handler', 'lavalink_handler'].forEach((handler) =>
  require(`./handlers/${handler}`)(client)
);

const mongoURI = process.env.MONGODB_SRV || require('./config.json').mongopath;

// Every command depends on the database, so don't come online without it.
mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 15000 })
  .then(() => {
    console.log('Connected to MongoDB!');
    return client.login(process.env.token);
  })
  .catch((err) => {
    console.error('❌ Could not connect to MongoDB. Check MONGODB_SRV in .env.\n', err.message);
    process.exit(1);
  });
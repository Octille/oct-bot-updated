"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("./config/env");
const db_1 = require("./db");
const logger_1 = require("./lib/logger");
const router_1 = require("./framework/router");
const ready_1 = require("./events/ready");
const scheduler_1 = require("./scheduler");
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers, discord_js_1.GatewayIntentBits.GuildMessages],
    partials: [discord_js_1.Partials.Channel],
});
(0, logger_1.attachLogClient)(client);
client.once(discord_js_1.Events.ClientReady, ready_1.onReady);
client.on(discord_js_1.Events.InteractionCreate, (interaction) => {
    (0, router_1.routeInteraction)(interaction).catch((err) => (0, logger_1.logError)('interaction', err));
});
client.on(discord_js_1.Events.Error, (err) => (0, logger_1.logError)('client', err));
process.on('unhandledRejection', (err) => (0, logger_1.logError)('unhandledRejection', err));
async function shutdown(signal) {
    console.log(`Received ${signal}, shutting down...`);
    (0, scheduler_1.stopScheduler)();
    await client.destroy();
    await mongoose_1.default.disconnect();
    process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
// Every feature depends on the database, so don't come online without it.
(0, db_1.connectDatabase)()
    .then(() => client.login(env_1.env.DISCORD_TOKEN))
    .catch((err) => {
    console.error('❌ Startup failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
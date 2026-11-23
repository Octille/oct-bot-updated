"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReady = onReady;
const discord_js_1 = require("discord.js");
const logger_1 = require("../lib/logger");
const scheduler_1 = require("../scheduler");
const jobs_1 = require("../scheduler/jobs");
function onReady(client) {
    (0, logger_1.logInfo)('ready', `Logged in as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
    client.user.setPresence({ activities: [{ name: '/help', type: discord_js_1.ActivityType.Listening }], status: 'online' });
    (0, scheduler_1.startScheduler)(client, jobs_1.jobs);
}
//# sourceMappingURL=ready.js.map
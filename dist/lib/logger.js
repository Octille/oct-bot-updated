"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachLogClient = attachLogClient;
exports.logError = logError;
exports.logInfo = logInfo;
const discord_js_1 = require("discord.js");
const env_1 = require("../config/env");
let client = null;
let lastSent = 0;
function attachLogClient(c) {
    client = c;
}
/** Logs to the console and, at most once every 5 seconds, to ERROR_LOG_CHANNEL_ID. */
function logError(context, err) {
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`[${context}]`, text);
    if (!client || !env_1.env.ERROR_LOG_CHANNEL_ID || Date.now() - lastSent < 5_000)
        return;
    lastSent = Date.now();
    const channel = client.channels.cache.get(env_1.env.ERROR_LOG_CHANNEL_ID);
    if (channel?.isSendable()) {
        channel.send(`⚠️ **${context}**\n${(0, discord_js_1.codeBlock)(text.slice(0, 1800))}`).catch(() => undefined);
    }
}
function logInfo(context, message) {
    console.log(`[${context}] ${message}`);
}
//# sourceMappingURL=logger.js.map
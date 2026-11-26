import { codeBlock, type Client } from 'discord.js';
import { env } from '../config/env';

let client: Client | null = null;
let lastSent = 0;

export function attachLogClient(c: Client): void {
  client = c;
}

/** Logs to the console and, at most once every 5 seconds, to ERROR_LOG_CHANNEL_ID. */
export function logError(context: string, err: unknown): void {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[${context}]`, text);

  if (!client || !env.ERROR_LOG_CHANNEL_ID || Date.now() - lastSent < 5_000) return;
  lastSent = Date.now();
  const channel = client.channels.cache.get(env.ERROR_LOG_CHANNEL_ID);
  if (channel?.isSendable()) {
    channel.send(`⚠️ **${context}**\n${codeBlock(text.slice(0, 1800))}`).catch(() => undefined);
  }
}

export function logInfo(context: string, message: string): void {
  console.log(`[${context}] ${message}`);
}

/** Logs to the console and posts a short line to ERROR_LOG_CHANNEL_ID (for events worth watching, not errors). */
export function logNotice(context: string, message: string): void {
  logInfo(context, message);
  const channel = client && env.ERROR_LOG_CHANNEL_ID ? client.channels.cache.get(env.ERROR_LOG_CHANNEL_ID) : null;
  if (channel?.isSendable()) channel.send({ content: `**${context}** ${message}`, allowedMentions: { parse: [] } }).catch(() => undefined);
}

import type { Message } from 'discord.js';
import { env } from '../config/env';
import { embed } from '../lib/embeds';
import { logError } from '../lib/logger';

/**
 * For 30 days after launch, an old `!command` gets a short "OctBot uses slash commands now" reply,
 * at most once per channel per hour (PLAN.md §7, decision 3). Off until LAUNCH_DATE is set.
 */

export const prefixNoticeRules = { days: 30, perChannelMs: 3_600_000 } as const;

/** The original bot's commands and aliases (lower case), so ordinary "!" messages are left alone. */
export const oldCommands = new Set([
  'balance', 'bal', 'bl', 'beg', 'buy', 'coinflip', 'cf', 'collect', 'wages', 'claim', 'hourly', 'company', 'comp', 'c', 'daily',
  'deposit', 'dep', 'fish', 'f', 'givecoin', 'heist', 'rob2', 'bigheist', 'inventory', 'inv', 'leaderboard', 'lb', 'top', 'mine', 'm',
  'mineupgrade', 'mu', 'pickaxe', 'prestige', 'rank', 'level', 'lvl', 'xp', 'profile', 'rob', 'sell', 'shop', 'sh', 'transfer', 'share',
  'give', 'withdraw', 'with', 'afk', 'afkset', 'avatar', 'av', 'help', 'h', 'invite', 'ping', 'pole', 'poll', 'server-info', 'serverinfo',
  'autorole', 'ban', 'clear', 'giverole', 'addrole', 'ar', 'gr', 'invitelinks', 'il', 'kick', 'mute', 'prefix', 'reactionrole', 'rr',
  'removerole', 'takerole', 'tempmute', 'ticketsetup', 'ticket-setup', 'unban', 'unmute', 'welcome', 'wc', 'join', 'connect', 'jump',
  'leave', 'disconnect', 'dc', 'loop', 'nowplaying', 'np', 'pause', 'play', 'p', 'queue', 'q', 'restart', 'resume', 'seek', 'shuffle',
  'skip', 's', 'stop', 'volume', 'vol', 'v',
]);

/** The old command a message tries to run, or null. */
export function oldCommandOf(content: string): string | null {
  const m = /^!\s?([a-z-]+)/i.exec(content.trim());
  const name = m?.[1]?.toLowerCase();
  return name && oldCommands.has(name) ? name : null;
}

/** Whether the notice period is running. */
export function noticeActive(now = Date.now(), launch = env.LAUNCH_DATE): boolean {
  if (!launch) return false;
  const start = new Date(launch).getTime();
  return Number.isFinite(start) && now >= start && now < start + prefixNoticeRules.days * 86_400_000;
}

const lastByChannel = new Map<string, number>();

/** Replies to an old prefix command when due. Returns true if the message was an old command. */
export async function prefixNotice(message: Message<true>, now = Date.now(), launch = env.LAUNCH_DATE): Promise<boolean> {
  if (!oldCommandOf(message.content)) return false;
  if (!noticeActive(now, launch)) return true;
  const last = lastByChannel.get(message.channelId) ?? 0;
  if (now - last < prefixNoticeRules.perChannelMs) return true;
  lastByChannel.set(message.channelId, now);
  await message.reply({
    embeds: [embed('utility').setDescription('OctBot uses **slash commands** now. Type `/` to see them, or try `/help` and `/menu`.')],
    allowedMentions: { repliedUser: false },
  }).catch((err) => logError('prefix notice', err));
  return true;
}

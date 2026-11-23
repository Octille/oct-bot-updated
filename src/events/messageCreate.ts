import type { Message } from 'discord.js';
import { chatXp } from '../content/levels';
import { logError } from '../lib/logger';
import { checkAchievements } from '../services/achievements';
import { announceLevelUp } from '../services/levelAnnounce';
import { awardChatXp, levelSettings, xpMultiplier } from '../services/levels';
import { User } from '../models/User';

/** Set at startup: whether the bot can read message text (privileged Message Content intent). */
let canReadContent = false;
export function setMessageContentAvailable(value: boolean): void {
  canReadContent = value;
}

/** Chat XP: one message per minute per member per server counts. */
export async function onMessageCreate(message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.system || message.webhookId) return;
  // Without the intent we can't see the text, so every message counts (still once a minute)
  if (canReadContent && message.content.trim().length < chatXp.minLength && !message.attachments.size) return;

  try {
    const levels = await levelSettings(message.guildId);
    const channel = message.channel;
    const parentId = 'parentId' in channel ? channel.parentId : null;
    if (levels.noXpChannelIds?.some((id) => id === channel.id || id === parentId)) return;

    const roleIds = message.member ? [...message.member.roles.cache.keys()] : [];
    const mult = xpMultiplier(levels, [channel.id, ...(parentId ? [parentId] : []), ...roleIds]);
    const up = await awardChatXp(message.guildId, message.author.id, mult);
    if (up === undefined) return; // on cooldown

    // Chat achievements (Say Hi, Chatterbox) for people who already play; unlocked quietly
    if (await User.exists({ _id: message.author.id })) await checkAchievements(message.author.id);

    if (up && message.member) await announceLevelUp(message.guild, message.member, levels, up, channel.isSendable() ? channel : null);
  } catch (err) {
    logError('chat xp', err);
  }
}

import type { Message } from 'discord.js';
import { dropRules } from '../content/events';
import { getGuildSettings } from '../models/GuildSettings';
import { Drop } from '../models/Events';
import { createDrop, noteChatter, shouldDrop } from '../services/drops';
import { dropView, expiredDropView } from '../ui/dropViews';
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
  await maybeDrop(message).catch((err) => logError('drops', err));
}

/* ── Chat drops ─────────────────────────────────────────────────────────────────────────── */

const dropSettings = new Map<string, { at: number; channelIds: string[]; perHour: number; enabled: boolean }>();

export function invalidateDropSettings(guildId: string): void {
  dropSettings.delete(guildId);
}

async function dropConfig(guildId: string) {
  const hit = dropSettings.get(guildId);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const s = await getGuildSettings(guildId);
  const cfg = { at: Date.now(), channelIds: s?.drops?.channelIds ?? [], perHour: s?.drops?.perHour ?? dropRules.defaultPerHour, enabled: !!s?.drops?.enabled };
  dropSettings.set(guildId, cfg);
  return cfg;
}

/** Spawns a drop now and then while enough different people are chatting in a drops channel. */
async function maybeDrop(message: Message<true>): Promise<void> {
  const cfg = await dropConfig(message.guildId);
  if (!cfg.enabled || !cfg.channelIds.includes(message.channelId)) return;
  const chatting = noteChatter(message.channelId, message.author.id);
  if (!shouldDrop(message.channelId, chatting, cfg.perHour) || !message.channel.isSendable()) return;
  const drop = await createDrop(message.guildId, message.channelId);
  const sent = await message.channel.send(dropView(drop));
  await Drop.updateOne({ _id: drop._id }, { $set: { messageId: sent.id } });
  // Expire it if nobody grabs it (the per-minute job catches anything a restart missed)
  setTimeout(() => {
    Drop.findOneAndUpdate({ _id: drop._id, status: 'open' }, { $set: { status: 'expired' } }, { lean: true })
      .then((d) => (d ? sent.edit(expiredDropView(d)) : null))
      .catch(() => undefined);
  }, dropRules.expireSeconds * 1000 + 500);
}

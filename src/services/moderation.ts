import { PermissionFlagsBits, type Client, type Guild, type GuildMember, type User } from 'discord.js';
import { embed } from '../lib/embeds';
import { titleIcon } from '../lib/icons';
import { logError } from '../lib/logger';
import { GuildSettings, getGuildSettings } from '../models/GuildSettings';

export type ModAction = 'ban' | 'unban' | 'kick' | 'timeout' | 'untimeout' | 'warn' | 'purge' | 'invite';

const LABEL: Record<ModAction, string> = {
  ban: 'Banned', unban: 'Unbanned', kick: 'Kicked', timeout: 'Timed out', untimeout: 'Timeout removed', warn: 'Warned', purge: 'Messages purged', invite: 'Invite link removed',
};

/**
 * Why the moderator can't act on the target, or null. Checks: not yourself, not the owner, not
 * the bot, and the target's top role is below both the moderator's (owner exempt) and the bot's.
 */
export function moderationBlocker(moderator: GuildMember, target: GuildMember, me: GuildMember, action: string): string | null {
  if (target.id === moderator.id) return `You can't ${action} yourself.`;
  if (target.id === me.id) return `I can't ${action} myself.`;
  if (target.id === target.guild.ownerId) return `You can't ${action} the server owner.`;
  if (moderator.id !== moderator.guild.ownerId && target.roles.highest.position >= moderator.roles.highest.position) {
    return `${target.displayName}'s highest role is the same as or above yours.`;
  }
  if (target.roles.highest.position >= me.roles.highest.position) return `${target.displayName}'s highest role is above mine. Move my role higher.`;
  return null;
}

export function hasPermission(member: GuildMember | null | undefined, perm: bigint): boolean {
  return !!member?.permissions.has(perm);
}

/** Next case number for the server (atomic). */
export async function nextCase(guildId: string): Promise<number> {
  const doc = await GuildSettings.findOneAndUpdate({ _id: guildId }, { $inc: { modCaseCounter: 1 } }, { upsert: true, new: true, lean: true });
  return doc!.modCaseCounter;
}

/** Posts a case to the server's mod-log channel, if one is set. */
export async function modLog(client: Client, guild: Guild, entry: { action: ModAction; target?: User | null; moderator: User; reason?: string | null; extra?: string; caseNo?: number }): Promise<void> {
  try {
    const settings = await getGuildSettings(guild.id);
    const channelId = settings?.modLogChannelId;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) return;
    const e = embed('moderation').setTitle(`${titleIcon('moderation')} ${LABEL[entry.action]}${entry.caseNo ? ` · case #${entry.caseNo}` : ''}`).setDescription([
      entry.target ? `**User:** ${entry.target} (\`${entry.target.id}\`)` : null,
      `**Moderator:** ${entry.moderator}`,
      entry.reason ? `**Reason:** ${entry.reason}` : null,
      entry.extra ?? null,
    ].filter(Boolean).join('\n')).setTimestamp();
    await channel.send({ embeds: [e], allowedMentions: { parse: [] } });
  } catch (err) {
    logError('mod log', err);
  }
}

/** Tells the member what happened, if their DMs are open. */
export async function notify(user: User, guild: Guild, text: string): Promise<boolean> {
  try {
    await user.send({ embeds: [embed('moderation').setTitle(guild.name).setDescription(text)] });
    return true;
  } catch {
    return false;
  }
}

/** "10m", "2h", "1d 12h", "1w" → ms (Discord timeouts: up to 28 days). */
export function parseDuration(input: string): number | null {
  const re = /(\d+)\s*(s|m|h|d|w)/gi;
  const unit: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  let total = 0;
  let matched = '';
  for (const m of input.matchAll(re)) {
    total += Number(m[1]) * unit[m[2]!.toLowerCase()]!;
    matched += m[0];
  }
  if (!total || matched.replace(/\s/g, '').length !== input.replace(/\s/g, '').length) return null;
  return total;
}

export const MAX_TIMEOUT_MS = 28 * 86_400_000;
export const INVITE_RE = /(?:discord\.gg|dsc\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/i;
export { PermissionFlagsBits };

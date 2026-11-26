import mongoose from 'mongoose';
import type { Client, Guild, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { GuildSettings } from '../models/GuildSettings';
import { embed } from '../lib/embeds';
import { logError, logInfo } from '../lib/logger';
import { roleBlocker } from './roles';

/**
 * Keeps the original bot's emoji reaction roles working (PLAN.md §7, decision 2) until each server
 * moves to /rolepanel. Reads v2's `reactionroles` collection (never writes it; nothing new is added
 * there any more), so it's loaded once at startup.
 */

export interface LegacyReactionRole { guildId: string; messageId: string; emoji: string; roleId: string }

let byMessage = new Map<string, LegacyReactionRole[]>();

export async function loadLegacyReactionRoles(): Promise<number> {
  const docs = await mongoose.connection.db!.collection('reactionroles').find({}).toArray();
  const rows = docs
    .map((d) => ({ guildId: String(d.GuildID ?? ''), messageId: String(d.MessageID ?? ''), emoji: String(d.Emoji ?? ''), roleId: String(d.RoleID ?? '') }))
    .filter((r) => r.guildId && r.messageId && r.emoji && r.roleId);
  setLegacyReactionRoles(rows);
  if (rows.length) logInfo('reaction roles', `${rows.length} legacy reaction role(s) on ${byMessage.size} message(s)`);
  return rows.length;
}

export function setLegacyReactionRoles(rows: LegacyReactionRole[]): void {
  byMessage = new Map();
  for (const r of rows) byMessage.set(r.messageId, [...(byMessage.get(r.messageId) ?? []), r]);
}

/** Roles for a reaction. v2 stored a unicode emoji, or a custom emoji's id (sometimes as `<:name:id>` or its name). */
export function legacyRolesFor(guildId: string, messageId: string, emoji: { id: string | null; name: string | null }): string[] {
  const strip = (s: string) => s.replace(/️/g, '');
  return (byMessage.get(messageId) ?? [])
    .filter((r) => r.guildId === guildId)
    .filter((r) => {
      if (emoji.id) return r.emoji === emoji.id || r.emoji.endsWith(`:${emoji.id}>`) || (!!emoji.name && r.emoji === emoji.name);
      return !!emoji.name && strip(r.emoji) === strip(emoji.name);
    })
    .map((r) => r.roleId);
}

/** Adds or removes the legacy role for a reaction. Never hands out roles with moderator powers. */
export async function onLegacyReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, added: boolean): Promise<void> {
  if (user.bot || byMessage.size === 0) return;
  const guild = reaction.message.guild;
  if (!guild || !byMessage.has(reaction.message.id)) return;
  const roles = legacyRolesFor(guild.id, reaction.message.id, reaction.emoji);
  if (!roles.length) return;
  try {
    const [member, me] = await Promise.all([guild.members.fetch(user.id), guild.members.fetchMe()]);
    for (const roleId of roles) {
      const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
      if (!role || roleBlocker(role, guild, me)) continue;
      if (added && !member.roles.cache.has(roleId)) await member.roles.add(role, 'Reaction role (from the original bot)');
      if (!added && member.roles.cache.has(roleId)) await member.roles.remove(role, 'Reaction role (from the original bot)');
    }
    await nudgeOwner(reaction.client, guild);
  } catch (err) {
    logError('legacy reaction role', err);
  }
}

/** Once per server: tell the owner these still work but should move to /rolepanel. */
async function nudgeOwner(client: Client, guild: Guild): Promise<void> {
  // Claimed atomically: when it was already sent, the filter misses and the upsert hits the existing id
  const first = await GuildSettings.updateOne(
    { _id: guild.id, legacyReactionRoleNoticeSent: { $ne: true } },
    { $set: { legacyReactionRoleNoticeSent: true } },
    { upsert: true },
  ).then(() => true, () => false);
  if (!first) return;
  const owner = await client.users.fetch(guild.ownerId).catch(() => null);
  await owner?.send({ embeds: [embed('utility').setTitle('Your reaction roles still work').setDescription([
    `The emoji reaction roles in **${guild.name}** were set up with the original OctBot. They keep working for now, but they won't get new features.`,
    '',
    'Move them to **/rolepanel**: buttons or a menu, a clear list of roles, and safety checks. Once you have, you can delete the old reaction-role messages.',
  ].join('\n'))] }).catch(() => undefined);
}

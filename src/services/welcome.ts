import { AttachmentBuilder, PermissionFlagsBits, type GuildMember } from 'discord.js';
import { embed } from '../lib/embeds';
import { titleIcon } from '../lib/icons';
import { welcomeCard } from '../lib/cards';
import { logError } from '../lib/logger';
import { getGuildSettings } from '../models/GuildSettings';
import { roleBlocker } from './roles';

export const DEFAULT_WELCOME = 'Welcome to **{server}**, {user}! You are member #{count}.';

/**
 * Fills a welcome template. Only {user} becomes a mention; names are escaped so they can't add
 * markdown or mentions of their own (pings are also locked to the new member when sending).
 */
export function welcomeText(template: string | null | undefined, m: { id: string; name: string; server: string; count: number }): string {
  const clean = (s: string) => s.replace(/[\\*_~`|>#[\]()-]/g, '\\$&').replace(/@/g, '@\u200b');
  const values: Record<string, string> = { user: `<@${m.id}>`, name: clean(m.name), server: clean(m.server), count: m.count.toLocaleString('en-US') };
  // One pass, so a name containing "{user}" stays plain text
  return (template || DEFAULT_WELCOME).replace(/\{(user|name|server|count)\}/g, (_, k: string) => values[k]!).slice(0, 2000);
}

/** Gives the autorole (if it's still safe to hand out). Members still in membership screening get it when they pass. */
export async function giveAutorole(member: GuildMember): Promise<void> {
  if (member.user.bot || member.pending) return;
  const settings = await getGuildSettings(member.guild.id);
  const role = settings?.autoRoleId ? member.guild.roles.cache.get(settings.autoRoleId) : null;
  const me = member.guild.members.me;
  if (!role || !me || member.roles.cache.has(role.id)) return;
  if (roleBlocker(role, member.guild, me)) return;
  await member.roles.add(role, 'Autorole').catch((err) => logError('autorole', err));
}

/** Posts the welcome message (and card) in the welcome channel, if one is set. */
export async function sendWelcome(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  const settings = await getGuildSettings(member.guild.id);
  const channelId = settings?.welcome?.channelId;
  const channel = channelId ? member.guild.channels.cache.get(channelId) : null;
  const me = member.guild.members.me;
  if (!channel?.isSendable() || !me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;
  const text = welcomeText(settings?.welcome?.message, { id: member.id, name: member.displayName, server: member.guild.name, count: member.guild.memberCount });
  const e = embed('utility').setTitle(`${titleIcon('welcome')} Welcome!`).setDescription(text);
  const files: AttachmentBuilder[] = [];
  if (settings?.welcome?.card !== false && channel.permissionsFor(me).has(PermissionFlagsBits.AttachFiles)) {
    try {
      const png = await welcomeCard({ name: member.displayName, avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }), server: member.guild.name, memberCount: member.guild.memberCount });
      files.push(new AttachmentBuilder(png, { name: 'welcome.png' }));
      e.setImage('attachment://welcome.png');
    } catch (err) {
      logError('welcome card', err);
    }
  }
  await channel.send({ content: `<@${member.id}>`, embeds: [e], files, allowedMentions: { users: [member.id] } }).catch((err) => logError('welcome', err));
}

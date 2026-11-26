import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  PermissionsBitField,
  StringSelectMenuBuilder,
  type EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { ANYONE, makeId } from '../lib/customId';
import { embed } from '../lib/embeds';
import { titleIcon } from '../lib/icons';

export const roleRules = {
  maxRolesPerPanel: 25,
  maxPanelsPerServer: 25,
} as const;

/**
 * Permissions a self-assigned (or auto-assigned) role must never carry: anyone could hand
 * themselves moderation or admin powers through a panel.
 */
export const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageGuildExpressions, PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.ManageEvents, PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers,
] as const;

interface RoleLike { id: string; name: string; managed: boolean; position: number; permissions: Readonly<PermissionsBitField> }
interface MemberLike { id: string; permissions: Readonly<PermissionsBitField>; roles: { highest: { position: number } } }

/**
 * Why this role can't be handed out by the bot, or null. With `invoker` (setting a panel or the
 * role panel up), the role must also sit below the invoker's highest role (the owner is exempt).
 */
export function roleBlocker(role: RoleLike, guild: { id: string; ownerId: string }, me: MemberLike, invoker?: MemberLike): string | null {
  if (role.id === guild.id) return "@everyone can't be handed out.";
  if (role.managed) return `${role.name} is managed by an integration or bot.`;
  const danger = DANGEROUS_PERMISSIONS.filter((p) => role.permissions.has(p, false));
  if (danger.length) {
    const names = new PermissionsBitField(danger).toArray().slice(0, 3).join(', ');
    return `${role.name} has moderator or admin permissions (${names}), so it can't be self-assigned.`;
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return 'I need the **Manage Roles** permission.';
  if (role.position >= me.roles.highest.position) return `Move my role above ${role.name} so I can give it.`;
  if (invoker && invoker.id !== guild.ownerId && role.position >= invoker.roles.highest.position) {
    return `${role.name} is the same as or above your highest role.`;
  }
  return null;
}

/** A unicode emoji or a custom `<:name:id>` one; anything else is rejected (Discord would refuse the panel). */
export function parsePanelEmoji(input: string | null | undefined): string | null | false {
  const s = input?.trim();
  if (!s) return null;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(s)) return s;
  if (/^(\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}️‍]*$/u.test(s) && s.length <= 16) return s;
  return false;
}

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

export interface PanelView {
  _id: { toString(): string };
  title: string;
  description?: string | null;
  style?: string | null;
  roles: readonly { roleId: string; label?: string | null; emoji?: string | null }[];
}

/** The public panel: an embed listing the roles, plus one grey button per role or a select menu. */
export function renderRolePanel(panel: PanelView, roleNames: Map<string, string>): { embeds: EmbedBuilder[]; components: Row[] } {
  const id = panel._id.toString();
  const name = (roleId: string) => roleNames.get(roleId) ?? 'deleted role';
  const labelOf = (r: { roleId: string; label?: string | null }) => (r.label || name(r.roleId)).slice(0, 80);
  const roles = panel.roles ?? [];
  const e = embed('utility').setTitle(`${titleIcon('roles')} ${panel.title}`).setDescription([
    panel.description || null,
    roles.length ? roles.map((r) => `${r.emoji ? `${r.emoji} ` : ''}<@&${r.roleId}>${r.label ? ` · ${r.label}` : ''}`).join('\n') : 'No roles yet.',
    '',
    `-# ${panel.style === 'select' ? 'Pick roles in the menu' : 'Press a button'} to get a role, again to remove it.`,
  ].filter((l) => l !== null).join('\n'));

  const components: Row[] = [];
  if (!roles.length) return { embeds: [e], components };
  if (panel.style === 'select') {
    const menu = new StringSelectMenuBuilder().setCustomId(makeId('rp', ANYONE, id, 's')).setPlaceholder('Pick roles to add or remove')
      .setMinValues(1).setMaxValues(roles.length)
      .addOptions(roles.map((r) => ({ label: labelOf(r), value: r.roleId, ...(r.emoji ? { emoji: r.emoji } : {}) })));
    components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu));
  } else {
    for (let i = 0; i < roles.length; i += 5) {
      components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(roles.slice(i, i + 5).map((r) => {
        const b = new ButtonBuilder().setCustomId(makeId('rp', ANYONE, id, r.roleId)).setStyle(ButtonStyle.Secondary).setLabel(labelOf(r));
        if (r.emoji) b.setEmoji(r.emoji);
        return b;
      })));
    }
  }
  return { embeds: [e], components };
}

/** Roles to add and remove for a toggle: picked roles the member has are removed, the rest added. */
export function toggleRoles(picked: string[], held: (roleId: string) => boolean): { add: string[]; remove: string[] } {
  const unique = [...new Set(picked)];
  return { add: unique.filter((r) => !held(r)), remove: unique.filter((r) => held(r)) };
}

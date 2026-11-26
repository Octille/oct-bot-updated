import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, type Guild, type GuildMember, type Role } from 'discord.js';
import { isValidObjectId } from 'mongoose';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { RolePanel } from '../../models/RolePanel';
import { parsePanelEmoji, renderRolePanel, roleBlocker, roleRules } from '../../services/roles';

type PanelDoc = NonNullable<Awaited<ReturnType<typeof findPanel>>>;

async function findPanel(guildId: string, id: string) {
  if (!isValidObjectId(id)) return null;
  return RolePanel.findOne({ _id: id, guildId });
}

const roleNames = (guild: Guild) => new Map(guild.roles.cache.map((r) => [r.id, r.name]));

/** Re-renders the panel message after a change (or says why it couldn't). */
async function refresh(guild: Guild, panel: PanelDoc): Promise<string | null> {
  const channel = guild.channels.cache.get(panel.channelId);
  if (!channel?.isTextBased() || !panel.messageId) return 'The panel message is gone. Delete this panel and make a new one.';
  const ok = await channel.messages.edit(panel.messageId, { ...renderRolePanel(panel.toObject(), roleNames(guild)), allowedMentions: { parse: [] } }).then(() => true, () => false);
  return ok ? null : "I couldn't update the panel message (deleted, or I lost access to the channel).";
}

function checkRole(role: Role, interaction: { guild: Guild | null; member: unknown }): void {
  const guild = interaction.guild!;
  const problem = roleBlocker(role, guild, guild.members.me!, interaction.member as GuildMember);
  if (problem) throw new UserError(problem);
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('rolepanel').setDescription('Button or menu panels members use to pick their own roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('create').setDescription('Post a new role panel')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post it').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName('title').setDescription('Panel title, e.g. "Pick your colours"').setRequired(true).setMaxLength(100))
      .addRoleOption((o) => o.setName('role').setDescription('The first role on it').setRequired(true))
      .addStringOption((o) => o.setName('style').setDescription('Buttons (default) or a dropdown menu').addChoices({ name: 'Buttons', value: 'buttons' }, { name: 'Dropdown menu', value: 'select' }))
      .addStringOption((o) => o.setName('description').setDescription('Text under the title').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('add').setDescription('Add a role to a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role to add').setRequired(true))
      .addStringOption((o) => o.setName('label').setDescription('Button text (default: the role name)').setMaxLength(80))
      .addStringOption((o) => o.setName('emoji').setDescription('An emoji for the button').setMaxLength(64)))
    .addSubcommand((s) => s.setName('remove').setDescription('Take a role off a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('delete').setDescription('Delete a panel and its message')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription("This server's role panels")),
  category: 'moderation',
  guildOnly: true,
  defer: 'ephemeral',
  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const panels = await RolePanel.find({ guildId: interaction.guildId }).sort({ createdAt: -1 }).limit(roleRules.maxPanelsPerServer).lean();
    const channelName = (id: string) => interaction.guild?.channels.cache.get(id)?.name ?? 'deleted channel';
    await interaction.respond(panels
      .map((p) => ({ name: `${p.title} · #${channelName(p.channelId)} · ${p.roles.length} roles`.slice(0, 100), value: String(p._id) }))
      .filter((c) => c.name.toLowerCase().includes(typed)).slice(0, 25));
  },
  async execute({ interaction }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) throw new UserError('You need the Manage Roles permission.');
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    const done = (text: string) => interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} ${text}`)], allowedMentions: { parse: [] } });

    if (sub === 'list') {
      const panels = await RolePanel.find({ guildId: guild.id }).sort({ createdAt: 1 }).lean();
      const lines = panels.map((p) => `**${p.title}** in <#${p.channelId}> · ${p.roles.length} role${p.roles.length === 1 ? '' : 's'} · ${p.style === 'select' ? 'menu' : 'buttons'}${p.messageId ? ` · [open](https://discord.com/channels/${guild.id}/${p.channelId}/${p.messageId})` : ''}`);
      return interaction.editReply({ embeds: [embed('utility').setTitle(`${titleIcon('roles')} Role panels`).setDescription(lines.join('\n') || 'None yet. Make one with `/rolepanel create`.')] });
    }

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel', true);
      const role = interaction.options.getRole('role', true) as Role;
      checkRole(role, interaction);
      if (await RolePanel.countDocuments({ guildId: guild.id }) >= roleRules.maxPanelsPerServer) throw new UserError(`At most ${roleRules.maxPanelsPerServer} role panels per server. Delete one first.`);
      const target = guild.channels.cache.get(channel.id);
      const me = guild.members.me!;
      if (!target?.isSendable() || !target.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        throw new UserError(`I can't post in <#${channel.id}> (I need View Channel, Send Messages and Embed Links there).`);
      }
      const panel = await RolePanel.create({
        guildId: guild.id, channelId: channel.id, title: interaction.options.getString('title', true),
        description: interaction.options.getString('description') ?? '', style: interaction.options.getString('style') ?? 'buttons',
        roles: [{ roleId: role.id }],
      });
      try {
        const msg = await target.send({ ...renderRolePanel(panel.toObject(), roleNames(guild)), allowedMentions: { parse: [] } });
        panel.messageId = msg.id;
        await panel.save();
      } catch (err) {
        await panel.deleteOne();
        throw err;
      }
      return done(`Posted **${panel.title}** in <#${channel.id}>. Add more roles with \`/rolepanel add\`.`);
    }

    const panel = await findPanel(guild.id, interaction.options.getString('panel', true));
    if (!panel) throw new UserError("That panel doesn't exist. Pick one from the list.");

    if (sub === 'delete') {
      const channel = guild.channels.cache.get(panel.channelId);
      if (channel?.isTextBased() && panel.messageId) await channel.messages.delete(panel.messageId).catch(() => undefined);
      await panel.deleteOne();
      return done(`Deleted **${panel.title}**. Members keep the roles they picked.`);
    }

    const role = interaction.options.getRole('role', true) as Role;
    if (sub === 'remove') {
      if (!panel.roles.some((r) => r.roleId === role.id)) throw new UserError(`${role} isn't on that panel.`);
      if (panel.roles.length === 1) throw new UserError('That is the last role on the panel. Delete the panel instead.');
      await RolePanel.updateOne({ _id: panel._id }, { $pull: { roles: { roleId: role.id } } });
      panel.roles.pull({ roleId: role.id });
      const warn = await refresh(guild, panel);
      return done(`Removed ${role} from **${panel.title}**.${warn ? `\n${icon('warning')} ${warn}` : ''}`);
    }

    // add
    checkRole(role, interaction);
    const emoji = parsePanelEmoji(interaction.options.getString('emoji'));
    if (emoji === false) throw new UserError('That emoji doesn\'t work. Use a normal emoji or one from this server, like 🎮.');
    const label = interaction.options.getString('label');
    const existing = panel.roles.find((r) => r.roleId === role.id);
    if (existing) {
      existing.label = label ?? existing.label;
      existing.emoji = emoji ?? existing.emoji;
    } else {
      if (panel.roles.length >= roleRules.maxRolesPerPanel) throw new UserError(`A panel holds at most ${roleRules.maxRolesPerPanel} roles. Make a second panel.`);
      panel.roles.push({ roleId: role.id, label, emoji });
    }
    await panel.save();
    const warn = await refresh(guild, panel);
    return done(`${existing ? 'Updated' : 'Added'} ${role} on **${panel.title}**.${warn ? `\n${icon('warning')} ${warn}` : ''}`);
  },
});

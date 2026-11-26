import { MessageFlags, type GuildMember } from 'discord.js';
import { isValidObjectId } from 'mongoose';
import { defineComponent } from '../framework/types';
import { UserError } from '../lib/errors';
import { icon } from '../lib/icons';
import { RolePanel } from '../models/RolePanel';
import { renderRolePanel, roleBlocker, toggleRoles } from '../services/roles';

/** Role panel buttons `rp:*:<panelId>:<roleId>` and menus `rp:*:<panelId>:s`: toggle the picked roles. */
export const rolePanelHandler = defineComponent({
  prefix: 'rp',
  async execute({ interaction, id }) {
    if (!interaction.inCachedGuild() || !(interaction.isButton() || interaction.isStringSelectMenu())) return;
    const [panelId, which] = id.args;
    const panel = isValidObjectId(panelId) ? await RolePanel.findOne({ _id: panelId, guildId: interaction.guildId }).lean() : null;
    if (!panel) throw new UserError('This role panel was deleted.');
    const allowed = new Set(panel.roles.map((r) => r.roleId));
    const picked = (interaction.isStringSelectMenu() ? interaction.values : [which!]).filter((r) => allowed.has(r));
    if (!picked.length) throw new UserError('That role is no longer on this panel.');

    const guild = interaction.guild;
    const member = interaction.member as GuildMember;
    const me = guild.members.me!;
    // Answer first (several role changes can take longer than Discord's 3 seconds)
    if (interaction.isStringSelectMenu()) {
      // Re-render so the menu clears for the next pick (it otherwise stays on this member's choice)
      await interaction.update({ ...renderRolePanel(panel, new Map(guild.roles.cache.map((r) => [r.id, r.name]))), allowedMentions: { parse: [] } });
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    const { add, remove } = toggleRoles(picked, (r) => member.roles.cache.has(r));
    const done: string[] = [];
    const problems: string[] = [];
    // Checked again on every press: permissions or role order may have changed since the panel was set up
    for (const roleId of [...add, ...remove]) {
      const role = guild.roles.cache.get(roleId);
      const problem = role ? roleBlocker(role, guild, me) : 'That role was deleted.';
      if (problem) {
        problems.push(problem);
        continue;
      }
      const adding = add.includes(roleId);
      try {
        if (adding) await member.roles.add(roleId, 'Role panel');
        else await member.roles.remove(roleId, 'Role panel');
        done.push(`${adding ? 'Added' : 'Removed'} <@&${roleId}>`);
      } catch {
        problems.push(`Couldn't change <@&${roleId}> (check my permissions and role order).`);
      }
    }
    const content = [...done.map((d) => `${icon('success')} ${d}`), ...problems.map((p) => `${icon('warning')} ${p}`)].join('\n');
    if (interaction.isStringSelectMenu()) await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    else await interaction.editReply({ content, allowedMentions: { parse: [] } });
  },
});

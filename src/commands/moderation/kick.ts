import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon } from '../../lib/icons';
import { modLog, nextCase, notify } from '../../services/moderation';
import { GUILD_ONLY, reasonOf, setup } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('kick').setDescription('Remove someone from the server (they can rejoin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).setContexts(GUILD_ONLY)
    .addUserOption((o) => o.setName('user').setDescription('Who to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(400)),
  category: 'moderation',
  guildOnly: true,
  defer: 'public',
  async execute({ interaction, client }) {
    const { guild, target } = await setup(interaction, PermissionFlagsBits.KickMembers, 'Kick Members', 'kick');
    if (!target) throw new UserError("They aren't in this server.");
    if (!target.kickable) throw new UserError(`I can't kick ${target.displayName}. Check my role position.`);
    const reason = reasonOf(interaction);
    await notify(target.user, guild, `You were kicked from **${guild.name}**.${reason ? `\nReason: ${reason}` : ''}`);
    await target.kick(`${interaction.user.tag}: ${reason ?? 'no reason'}`);
    const caseNo = await nextCase(guild.id);
    await modLog(client, guild, { action: 'kick', target: target.user, moderator: interaction.user, reason, caseNo });
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Kicked ${target.user} (case #${caseNo}).${reason ? ` Reason: ${reason}` : ''}`)], allowedMentions: { parse: [] } });
  },
});

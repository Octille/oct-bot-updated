import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon } from '../../lib/icons';
import { modLog, nextCase } from '../../services/moderation';
import { GUILD_ONLY, reasonOf, setup } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('untimeout').setDescription('End a timeout early')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(GUILD_ONLY)
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(400)),
  category: 'moderation',
  guildOnly: true,
  defer: 'public',
  async execute({ interaction, client }) {
    const { guild, target } = await setup(interaction, PermissionFlagsBits.ModerateMembers, 'Timeout Members', 'remove the timeout of');
    if (!target) throw new UserError("They aren't in this server.");
    if (!target.isCommunicationDisabled()) throw new UserError("They aren't timed out.");
    if (!target.moderatable) throw new UserError(`I can't change ${target.displayName}'s timeout. Check my role position.`);
    const reason = reasonOf(interaction);
    await target.timeout(null, `${interaction.user.tag}: ${reason ?? 'no reason'}`);
    const caseNo = await nextCase(guild.id);
    await modLog(client, guild, { action: 'untimeout', target: target.user, moderator: interaction.user, reason, caseNo });
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} ${target.user} can talk again (case #${caseNo}).`)], allowedMentions: { parse: [] } });
  },
});

import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon } from '../../lib/icons';
import { modLog, nextCase } from '../../services/moderation';
import { GUILD_ONLY, reasonOf, setup } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('unban').setDescription('Lift a ban')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setContexts(GUILD_ONLY)
    .addStringOption((o) => o.setName('user_id').setDescription('Their user ID').setRequired(true).setMaxLength(20))
    .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(400)),
  category: 'moderation',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction, client }) {
    const { guild } = await setup(interaction, PermissionFlagsBits.BanMembers, 'Ban Members', 'unban', false);
    const id = interaction.options.getString('user_id', true).trim();
    if (!/^\d{15,20}$/.test(id)) throw new UserError("That isn't a user ID.");
    const ban = await guild.bans.fetch(id).catch(() => null);
    if (!ban) throw new UserError("That user isn't banned here.");
    const reason = reasonOf(interaction);
    await guild.members.unban(id, `${interaction.user.tag}: ${reason ?? 'no reason'}`);
    const caseNo = await nextCase(guild.id);
    await modLog(client, guild, { action: 'unban', target: ban.user, moderator: interaction.user, reason, caseNo });
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Unbanned **${ban.user.username}** (case #${caseNo}).`)] });
  },
});

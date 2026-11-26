import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon } from '../../lib/icons';
import { Warning } from '../../models/Warning';
import { modLog, nextCase, notify } from '../../services/moderation';
import { GUILD_ONLY, setup } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('warn').setDescription('Give someone a warning (kept on record)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(GUILD_ONLY)
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400)),
  category: 'moderation',
  guildOnly: true,
  // Private to the moderator: the member gets a DM and it goes in the mod log, nothing public
  defer: 'ephemeral',
  async execute({ interaction, client }) {
    const { guild, user } = await setup(interaction, PermissionFlagsBits.ModerateMembers, 'Timeout Members', 'warn');
    if (user!.bot) throw new UserError("Bots don't need warnings.");
    const reason = interaction.options.getString('reason', true).trim();
    const caseNo = await nextCase(guild.id);
    await Warning.create({ guildId: guild.id, userId: user!.id, modId: interaction.user.id, reason, case: caseNo });
    const total = await Warning.countDocuments({ guildId: guild.id, userId: user!.id });
    const dmed = await notify(user!, guild, `You were warned in **${guild.name}**.\nReason: ${reason}`);
    await modLog(client, guild, { action: 'warn', target: user, moderator: interaction.user, reason, caseNo, extra: `**Warnings now:** ${total}` });
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Warned ${user} (case #${caseNo}). They have **${total}** warning${total === 1 ? '' : 's'}.${dmed ? '' : " Their DMs are closed, so they weren't told."}`)], allowedMentions: { parse: [] } });
  },
});

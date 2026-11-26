import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon } from '../../lib/icons';
import { MAX_TIMEOUT_MS, modLog, nextCase, notify, parseDuration } from '../../services/moderation';
import { GUILD_ONLY, reasonOf, setup } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('timeout').setDescription("Stop someone talking for a while (Discord's built-in timeout)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(GUILD_ONLY)
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d (up to 28d)').setRequired(true).setMaxLength(20))
    .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(400)),
  category: 'moderation',
  guildOnly: true,
  defer: 'public',
  async execute({ interaction, client }) {
    const { guild, target } = await setup(interaction, PermissionFlagsBits.ModerateMembers, 'Timeout Members', 'time out');
    if (!target) throw new UserError("They aren't in this server.");
    if (target.permissions.has(PermissionFlagsBits.Administrator)) throw new UserError("Administrators can't be timed out.");
    if (!target.moderatable) throw new UserError(`I can't time out ${target.displayName}. Check my role position.`);
    const ms = parseDuration(interaction.options.getString('duration', true));
    if (!ms || ms > MAX_TIMEOUT_MS) throw new UserError('Give a duration like `10m`, `2h` or `1d`, up to 28 days.');
    const reason = reasonOf(interaction);
    await target.timeout(ms, `${interaction.user.tag}: ${reason ?? 'no reason'}`);
    const caseNo = await nextCase(guild.id);
    const until = Math.floor((Date.now() + ms) / 1000);
    await notify(target.user, guild, `You were timed out in **${guild.name}** until <t:${until}:f>.${reason ? `\nReason: ${reason}` : ''}`);
    await modLog(client, guild, { action: 'timeout', target: target.user, moderator: interaction.user, reason, caseNo, extra: `**Until:** <t:${until}:f>` });
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Timed out ${target.user} until <t:${until}:R> (case #${caseNo}).`)], allowedMentions: { parse: [] } });
  },
});

import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { Warning } from '../../models/Warning';
import { modLog } from '../../services/moderation';
import { GUILD_ONLY } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('warnings').setDescription("See or remove someone's warnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(GUILD_ONLY)
    .addUserOption((o) => o.setName('user').setDescription('Whose warnings').setRequired(true))
    .addIntegerOption((o) => o.setName('remove').setDescription('Remove the warning with this case number').setMinValue(1)),
  category: 'moderation',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) throw new UserError('You need the Timeout Members permission.');
    const user = interaction.options.getUser('user', true);
    const remove = interaction.options.getInteger('remove');
    if (remove) {
      const removed = await Warning.findOneAndDelete({ guildId: interaction.guildId, userId: user.id, case: remove }, { lean: true });
      if (!removed) throw new UserError(`${user.username} has no warning with case #${remove}.`);
      await modLog(interaction.client, interaction.guild!, { action: 'warn', target: user, moderator: interaction.user, reason: removed.reason, extra: `**Removed warning** case #${remove} (given by <@${removed.modId}>)` });
      return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Removed case #${remove} from ${user}.`)] });
    }
    const list = await Warning.find({ guildId: interaction.guildId, userId: user.id }, null, { lean: true }).sort({ createdAt: -1 }).limit(15);
    const total = await Warning.countDocuments({ guildId: interaction.guildId, userId: user.id });
    return interaction.editReply({
      embeds: [embed('moderation').setTitle(`${titleIcon('moderation')} Warnings › ${user.username}`).setDescription(list.length
        ? [`**${total}** warning${total === 1 ? '' : 's'}${total > list.length ? ` (latest ${list.length})` : ''}`, '', ...list.map((w) => `**#${w.case}** <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:d> by <@${w.modId}>\n${w.reason}`)].join('\n')
        : `${user} has no warnings.`)],
      allowedMentions: { parse: [] },
    });
  },
});

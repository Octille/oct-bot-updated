import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon } from '../../lib/icons';
import { modLog } from '../../services/moderation';
import { GUILD_ONLY, setup } from './common';

const FOURTEEN_DAYS = 14 * 86_400_000;

export default defineCommand({
  data: new SlashCommandBuilder().setName('purge').setDescription('Delete recent messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).setContexts(GUILD_ONLY)
    .addIntegerOption((o) => o.setName('amount').setDescription('How many to check (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only messages from this person')),
  category: 'moderation',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction, client }) {
    // Cleaning up anyone's messages (yourself, bots, higher roles) is fine: no role-order check
    const { guild, user } = await setup(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages', 'purge', { targetRequired: false, hierarchy: false });
    if (!interaction.appPermissions?.has(PermissionFlagsBits.ReadMessageHistory)) throw new UserError('I need the Read Message History permission here.');
    const channel = interaction.channel;
    if (!channel || !('bulkDelete' in channel)) throw new UserError("I can't delete messages here.");
    const amount = interaction.options.getInteger('amount', true);
    const recent = await channel.messages.fetch({ limit: amount });
    // Discord only bulk-deletes messages under 14 days old
    const toDelete = recent.filter((m) => (!user || m.author.id === user.id) && Date.now() - m.createdTimestamp < FOURTEEN_DAYS && !m.pinned);
    const deleted = toDelete.size ? await channel.bulkDelete(toDelete, true) : null;
    const n = deleted?.size ?? 0;
    await modLog(client, guild, { action: 'purge', target: user, moderator: interaction.user, extra: `**Deleted:** ${n} message${n === 1 ? '' : 's'} in <#${channel.id}>` });
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Deleted ${n} message${n === 1 ? '' : 's'}${user ? ` from ${user}` : ''}.${n < toDelete.size || toDelete.size < recent.size ? ' Pinned messages and ones older than 14 days were skipped.' : ''}`)] });
  },
});

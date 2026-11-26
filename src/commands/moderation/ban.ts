import { ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button, rows } from '../../lib/ui';
import { modLog, nextCase, notify } from '../../services/moderation';
import { GUILD_ONLY, reasonOf, setup } from './common';

export default defineCommand({
  data: new SlashCommandBuilder().setName('ban').setDescription('Ban someone from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setContexts(GUILD_ONLY)
    .addUserOption((o) => o.setName('user').setDescription('Who to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why (shown in the mod log and to them)').setMaxLength(400))
    .addIntegerOption((o) => o.setName('delete_messages').setDescription('Delete their recent messages').addChoices(
      { name: "Don't delete", value: 0 }, { name: 'Last hour', value: 3_600 }, { name: 'Last day', value: 86_400 }, { name: 'Last 7 days', value: 604_800 })),
  category: 'moderation',
  guildOnly: true,
  async execute({ interaction, client }) {
    const { guild, user } = await setup(interaction, PermissionFlagsBits.BanMembers, 'Ban Members', 'ban');
    const reason = reasonOf(interaction);
    const seconds = interaction.options.getInteger('delete_messages') ?? 0;
    const target = user!;
    await interaction.reply({
      embeds: [embed('warning').setTitle(`${titleIcon('moderation')} Ban ${target.username}?`).setDescription(`${icon('warning')} ${target} will be banned${reason ? ` for: ${reason}` : ''}.${seconds ? ' Their recent messages will be deleted.' : ''}`)],
      components: rows([button('~ban', interaction.user.id, ['no'], 'Cancel', ButtonStyle.Secondary), button('~ban', interaction.user.id, ['yes'], `Ban ${target.username}`.slice(0, 30), ButtonStyle.Danger)]),
      flags: MessageFlags.Ephemeral,
    });
    const message = await interaction.fetchReply();
    const collector = collect(message, { time: 30_000, max: 1, disableOnEnd: false });
    collector.on('collect', (i) => {
      (async () => {
        if (i.customId.endsWith('no')) return i.update({ embeds: [embed('economy').setDescription('Cancelled.')], components: [] });
        const caseNo = await nextCase(guild.id);
        const dmed = await notify(target, guild, `You were banned from **${guild.name}**.${reason ? `\nReason: ${reason}` : ''}`);
        await guild.members.ban(target.id, { reason: `${interaction.user.tag}: ${reason ?? 'no reason'}`, deleteMessageSeconds: seconds });
        await i.update({ embeds: [embed('success').setDescription(`${icon('success')} Banned ${target} (case #${caseNo}).${dmed ? '' : ' Their DMs are closed, so they weren\'t told why.'}`)], components: [] });
        const channel = interaction.channel;
        if (channel?.isSendable()) await channel.send({ embeds: [embed('moderation').setDescription(`${target} was banned.${reason ? ` Reason: ${reason}` : ''}`)], allowedMentions: { parse: [] } }).catch(() => undefined);
        await modLog(client, guild, { action: 'ban', target, moderator: interaction.user, reason, caseNo });
      })().catch(async (err) => {
        logError('ban', err);
        await i.editReply({ embeds: [embed('error').setDescription(`${icon('error')} The ban failed. Check my permissions and role position.`)], components: [] }).catch(() => undefined);
      });
    });
    collector.on('end', (c) => {
      if (!c.size) interaction.editReply({ embeds: [embed('economy').setDescription('Timed out. Nobody was banned.')], components: [] }).catch(() => undefined);
    });
  },
});

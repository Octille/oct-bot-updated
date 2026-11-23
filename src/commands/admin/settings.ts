import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { icon } from '../../lib/icons';
import { UserError } from '../../lib/errors';
import { GuildSettings } from '../../models/GuildSettings';
import { invalidateGambling } from '../../services/gambling';

/** Server settings (admins). Phase 6 turns this into a full dashboard. */
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Server settings (admins)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('gambling').setDescription('Turn gambling games on or off in this server')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Allow gambling here?').setRequired(true))),
  category: 'utility',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('You need the Manage Server permission.');
    const enabled = interaction.options.getBoolean('enabled', true);
    await GuildSettings.updateOne({ _id: interaction.guildId! }, { $set: { gamblingEnabled: enabled } }, { upsert: true });
    invalidateGambling(interaction.guildId!);
    return interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} Gambling is now **${enabled ? 'on' : 'off'}** in this server.`)] });
  },
});

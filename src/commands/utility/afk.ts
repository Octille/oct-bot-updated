import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { titleIcon } from '../../lib/icons';
import { afkRules, cleanReason, setAfk } from '../../services/afk';

export default defineCommand({
  data: new SlashCommandBuilder().setName('afk').setDescription("Say you're away; people who mention you are told")
    .addStringOption((o) => o.setName('reason').setDescription('Why, e.g. "dinner"').setMaxLength(afkRules.maxReason)),
  category: 'utility',
  guildOnly: true,
  async execute({ interaction }) {
    const reason = interaction.options.getString('reason');
    await setAfk(interaction.guildId!, interaction.user.id, reason);
    const clean = cleanReason(reason);
    return interaction.reply({
      embeds: [embed('utility').setTitle(`${titleIcon('afk')} AFK`).setDescription(`${interaction.user} is away${clean ? `: ${clean}` : ''}.\n-# Send a message here when you're back.`)],
      allowedMentions: { parse: [] },
    });
  },
});

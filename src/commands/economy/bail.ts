import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { successEmbed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { payBail } from '../../services/jail';

export default defineCommand({
  data: new SlashCommandBuilder().setName('bail').setDescription('Pay to get out of jail early'),
  category: 'economy',
  async execute({ interaction }) {
    const cost = await payBail(interaction.user.id);
    await interaction.reply({ embeds: [successEmbed(`🔓 You paid **${coins(cost)}** bail and walked out. Try not to come back.`)] });
  },
});

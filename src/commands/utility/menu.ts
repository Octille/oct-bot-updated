import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { openHub } from '../../ui/handlers';

export default defineCommand({
  data: new SlashCommandBuilder().setName('menu').setDescription('Your menu: what you can do right now'),
  category: 'utility',
  async execute({ interaction }) {
    await interaction.reply({ ...(await openHub(interaction.user, interaction.guildId)), flags: MessageFlags.Ephemeral });
  },
});

import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('help').setDescription('Every command, by category'),
  category: 'utility',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'help', profile);
  },
});

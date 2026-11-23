import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('prestige').setDescription('Reset your level for a permanent bonus, and the prestige shop'),
  category: 'levels',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'prestige', profile);
  },
});

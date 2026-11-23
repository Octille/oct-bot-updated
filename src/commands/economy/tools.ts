import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('tools').setDescription('Buy, upgrade and repair your pickaxe, rod, weapon and shovel'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'shop.tools', profile);
  },
});

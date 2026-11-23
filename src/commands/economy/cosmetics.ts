import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('cosmetics').setDescription('Equip titles, badges, themes and card styles'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'wardrobe', profile);
  },
});

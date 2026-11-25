import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('pet').setDescription('Adopt, feed and play with your pet'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'pet', profile);
  },
});

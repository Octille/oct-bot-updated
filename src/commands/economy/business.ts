import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('business').setDescription('Your business: hire workers, collect income, upgrade'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'biz', profile);
  },
});

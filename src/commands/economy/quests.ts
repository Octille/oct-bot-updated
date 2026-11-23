import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('quests').setDescription('Your daily and weekly quests, and reminders'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'quests.daily', profile);
  },
});

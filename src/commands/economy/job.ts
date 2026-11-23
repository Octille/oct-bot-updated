import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('job').setDescription('See jobs and switch to a new one'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'job', profile);
  },
});

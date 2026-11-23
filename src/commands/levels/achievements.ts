import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('achievements').setDescription('Your achievements and what each one is worth'),
  category: 'levels',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'ach', profile);
  },
});

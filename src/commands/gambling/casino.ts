import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('casino').setDescription('Every game, its odds, your max bets and your gambling record'),
  category: 'gambling',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'casino', profile);
  },
});

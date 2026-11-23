import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('shop').setDescription('Tools, consumables, crates, deals and cosmetics'),
  category: 'economy',
  async execute({ interaction, profile }) {
    await replyWithScreen(interaction, 'shop', profile);
  },
});

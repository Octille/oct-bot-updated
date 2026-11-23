import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { getProfile } from '../../services/economy';
import { fishdexEmbed } from '../../ui/screens/fishdex';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('fishdex')
    .setDescription('Every fish species you have caught')
    .addUserOption((o) => o.setName('user').setDescription("Someone else's fishdex")),
  category: 'economy',
  async execute({ interaction, profile }) {
    const target = interaction.options.getUser('user');
    if (target && target.id !== interaction.user.id) {
      return interaction.reply({ embeds: [fishdexEmbed(await getProfile(target.id), target.globalName ?? target.username, 'all')] });
    }
    await replyWithScreen(interaction, 'dex.all', profile);
  },
});

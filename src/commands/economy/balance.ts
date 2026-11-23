import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { getProfile } from '../../services/economy';
import { balanceCard } from '../../ui/screens/balance';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Your wallet, bank and account level')
    .addUserOption((o) => o.setName('user').setDescription('Someone else to check')),
  category: 'economy',
  async execute({ interaction, profile }) {
    const target = interaction.options.getUser('user');
    if (target && target.id !== interaction.user.id) {
      if (target.bot) return interaction.reply({ content: "Bots don't carry wallets.", flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: [balanceCard(await getProfile(target.id), target.globalName ?? target.username, target.displayAvatarURL())] });
    }
    await replyWithScreen(interaction, 'bal', profile);
  },
});

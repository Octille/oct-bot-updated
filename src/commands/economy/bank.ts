import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { successEmbed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { parseAmount } from '../../lib/amount';
import { UserError } from '../../lib/errors';
import { capacityOf, deposit, withdraw } from '../../services/economy';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Move coins between your wallet and bank')
    .addSubcommand((s) => s.setName('deposit').setDescription('Wallet → bank (safe from robbers)')
      .addStringOption((o) => o.setName('amount').setDescription('e.g. 500, 2.5k, half, all').setRequired(true)))
    .addSubcommand((s) => s.setName('withdraw').setDescription('Bank → wallet')
      .addStringOption((o) => o.setName('amount').setDescription('e.g. 500, 2.5k, half, all').setRequired(true))),
  category: 'economy',
  async execute({ interaction, profile }) {
    const sub = interaction.options.getSubcommand();
    const input = interaction.options.getString('amount', true);
    const isAll = ['all', 'max'].includes(input.trim().toLowerCase());

    if (sub === 'deposit') {
      let request: number | 'all' = 'all';
      if (!isAll) {
        const parsed = parseAmount(input, profile.wallet);
        if (!parsed.ok) throw new UserError(parsed.reason);
        request = parsed.value;
      }
      const { amount, profile: after } = await deposit(interaction.user.id, request);
      const full = after.bank >= capacityOf(after) ? ' Your bank is now full.' : '';
      return interaction.reply({ embeds: [successEmbed(
        `Deposited **${coins(amount)}**.${full}\nBank: ${coins(after.bank)} / ${num(capacityOf(after))}`,
      )] });
    }

    let request: number | 'all' = 'all';
    if (!isAll) {
      const parsed = parseAmount(input, profile.bank);
      if (!parsed.ok) throw new UserError(parsed.reason);
      request = parsed.value;
    }
    const { amount, profile: after } = await withdraw(interaction.user.id, request);
    return interaction.reply({ embeds: [successEmbed(`Withdrew **${coins(amount)}**.\nWallet: ${coins(after.wallet)}`)] });
  },
});

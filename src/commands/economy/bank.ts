import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { coins } from '../../lib/format';
import { parseAmount } from '../../lib/amount';
import { UserError } from '../../lib/errors';
import { deposit, withdraw } from '../../services/economy';
import { replyWithScreen } from '../../ui/open';

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
    const dep = interaction.options.getSubcommand() === 'deposit';
    const input = interaction.options.getString('amount', true);
    let request: number | 'all' = 'all';
    if (!['all', 'max'].includes(input.trim().toLowerCase())) {
      const parsed = parseAmount(input, dep ? profile.wallet : profile.bank);
      if (!parsed.ok) throw new UserError(parsed.reason);
      request = parsed.value;
    }
    const { amount, profile: after } = dep ? await deposit(interaction.user.id, request) : await withdraw(interaction.user.id, request);
    await replyWithScreen(interaction, 'bal', after, dep ? `🏦 Deposited **${coins(amount)}**.` : `👛 Withdrew **${coins(amount)}**.`);
  },
});

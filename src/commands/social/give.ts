import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { giveTax } from '../../content/social';
import { parseAmount } from '../../lib/amount';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { giveCoins } from '../../services/trade';
import { allowanceLeft } from '../../services/antiAlt';
import { getProfile } from '../../services/economy';

export default defineCommand({
  data: new SlashCommandBuilder().setName('give').setDescription(`Send coins from your wallet (${Math.round(giveTax * 100)}% tax)`)
    .addUserOption((o) => o.setName('user').setDescription('Who to give to').setRequired(true))
    .addStringOption((o) => o.setName('amount').setDescription('e.g. 500, 2.5k, half, all').setRequired(true)),
  category: 'social',
  guildOnly: true,
  async execute({ interaction, profile }) {
    const target = interaction.options.getUser('user', true);
    if (target.bot) throw new UserError("Bots don't need coins.");
    const parsed = parseAmount(interaction.options.getString('amount', true), profile.wallet);
    if (!parsed.ok) throw new UserError(parsed.reason);
    const r = await giveCoins(interaction.user.id, target.id, parsed.value);
    const left = allowanceLeft(await getProfile(interaction.user.id));
    await interaction.reply({
      embeds: [embed('success').setTitle(`${titleIcon('give')} Give`).setDescription(`${icon('success')} <@${target.id}> received **${coins(r.received)}** from <@${interaction.user.id}>.\n-# ${coins(r.tax)} tax · you can send ${coins(left.coins)} more today.`)],
      allowedMentions: { users: [target.id] },
    });
  },
});

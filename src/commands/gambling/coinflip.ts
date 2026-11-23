import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { coinflip } from '../../game/gambling/simple';
import { defaultRng } from '../../lib/rng';
import { assertGamblingAllowed, parseBet } from '../../services/gambling';
import { quickRound } from './round';

export default defineCommand({
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Call heads or tails: win 1.95×')
    .addStringOption((o) => o.setName('bet').setDescription('e.g. 500, 2.5k, half, all').setRequired(true))
    .addStringOption((o) => o.setName('call').setDescription('Heads or tails').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),
  category: 'gambling',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    await assertGamblingAllowed(interaction);
    const bet = parseBet(interaction.options.getString('bet', true), profile, 'coinflip');
    const call = interaction.options.getString('call', true) as 'heads' | 'tails';
    await quickRound(interaction, 'coinflip', bet, () => {
      const r = coinflip(call, defaultRng);
      return { multiplier: r.multiplier, reveal: `🪙 **${r.side === 'heads' ? 'Heads' : 'Tails'}**`, line: r.multiplier ? `You called ${call}.` : `You called ${call}. Unlucky.` };
    }, '🪙 Flipping…');
  },
});

import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { spinSlots } from '../../game/gambling/simple';
import { defaultRng } from '../../lib/rng';
import { assertGamblingAllowed, parseBet } from '../../services/gambling';
import { quickRound } from './round';

export default defineCommand({
  data: new SlashCommandBuilder().setName('slots').setDescription('Spin three reels: up to 25×')
    .addStringOption((o) => o.setName('bet').setDescription('e.g. 500, 2.5k, half, all').setRequired(true)),
  category: 'gambling',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    await assertGamblingAllowed(interaction);
    const bet = parseBet(interaction.options.getString('bet', true), profile, 'slots');
    await quickRound(interaction, 'slots', bet, () => {
      const r = spinSlots(defaultRng);
      const line = r.multiplier >= 4 ? `Three of a kind: **${r.multiplier}×**!` : r.multiplier > 0 ? `A pair: **${r.multiplier}×**.` : 'No match.';
      return { multiplier: r.multiplier, reveal: `**[ ${r.reels.map((s) => s.emoji).join(' │ ')} ]**`, line };
    }, '**[ 🎰 │ 🎰 │ 🎰 ]** Spinning…');
  },
});

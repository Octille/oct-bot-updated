import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import type { RouletteBet } from '../../content/gambling';
import { rouletteColor, spinRoulette } from '../../game/gambling/simple';
import { UserError } from '../../lib/errors';
import { defaultRng } from '../../lib/rng';
import { assertGamblingAllowed, parseBet } from '../../services/gambling';
import { quickRound } from './round';

const LABEL: Record<string, string> = {
  red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36', d1: '1st dozen (1–12)', d2: '2nd dozen (13–24)', d3: '3rd dozen (25–36)',
};
const DOT = { red: '🔴', black: '⚫', green: '🟢' } as const;

export default defineCommand({
  data: new SlashCommandBuilder().setName('roulette').setDescription('European roulette: colours 2×, dozens 3×, a number 36×')
    .addStringOption((o) => o.setName('bet').setDescription('e.g. 500, 2.5k, half, all').setRequired(true))
    .addStringOption((o) => o.setName('on').setDescription('What to bet on (or pick a number below)').addChoices(...Object.entries(LABEL).map(([value, name]) => ({ name, value }))))
    .addIntegerOption((o) => o.setName('number').setDescription('A single number, 0–36 (pays 36×)').setMinValue(0).setMaxValue(36)),
  category: 'gambling',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    await assertGamblingAllowed(interaction);
    const on = interaction.options.getString('on');
    const number = interaction.options.getInteger('number');
    if ((on === null) === (number === null)) throw new UserError('Pick either `on` (red, black, a dozen…) or a `number`.');
    const target: RouletteBet = number !== null ? { kind: 'number', number }
      : on!.startsWith('d') ? { kind: 'dozen', dozen: Number(on!.slice(1)) as 1 | 2 | 3 }
      : { kind: on as 'red' };
    const bet = parseBet(interaction.options.getString('bet', true), profile, 'roulette', target.kind);
    const label = number !== null ? `number ${number}` : LABEL[on!]!;
    await quickRound(interaction, 'roulette', bet, () => {
      const r = spinRoulette(target, defaultRng);
      return { multiplier: r.multiplier, reveal: `${DOT[rouletteColor(r.number)]} **${r.number}**`, line: `You bet on ${label}.` };
    }, '🎡 The ball is spinning…');
  },
});

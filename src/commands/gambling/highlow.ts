import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { MAX_PAYOUT } from '../../content/gambling';
import { cardText, drawCard, type Card } from '../../game/gambling/cards';
import { highlowMultiplier, highlowWins } from '../../game/gambling/highlow';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { defaultRng } from '../../lib/rng';
import { button, rows } from '../../lib/ui';
import { assertGamblingAllowed, netText, parseBet, payOut, takeBet } from '../../services/gambling';
import { btn, ids, NAV, row } from '../../ui/kit';
import { resultKind } from './round';

export default defineCommand({
  data: new SlashCommandBuilder().setName('highlow').setDescription('Guess higher or lower, card after card. Cash out any time')
    .addStringOption((o) => o.setName('bet').setDescription('e.g. 500, 2.5k, half, all').setRequired(true)),
  category: 'gambling',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    await assertGamblingAllowed(interaction);
    const userId = interaction.user.id;
    const bet = parseBet(interaction.options.getString('bet', true), profile, 'highlow');
    await takeBet(userId, 'highlow', bet);
    let card: Card = drawCard(defaultRng);
    let pot = bet;
    let streak = 0;
    const history: string[] = [];

    const playing = (line?: string) => {
      const up = highlowMultiplier(card.rank, 'higher');
      const down = highlowMultiplier(card.rank, 'lower');
      return {
        embeds: [embed('economy').setTitle(`${titleIcon('highlow')} High-Low`).setDescription([
          line, `Card: **${cardText(card)}**${history.length ? `  ·  before: ${history.slice(-5).join(' ')}` : ''}`,
          `Pot **${coins(pot)}** (${streak} correct) · Ties count as a win.`,
        ].filter(Boolean).join('\n'))],
        components: rows([
          button('~hl', userId, ['higher'], up ? `Higher · ${up}×` : 'Higher', ButtonStyle.Success, undefined, !up),
          button('~hl', userId, ['lower'], down ? `Lower · ${down}×` : 'Lower', ButtonStyle.Success, undefined, !down),
          button('~hl', userId, ['cash'], streak ? `Cash out · ${coins(pot)}` : 'Cash out', ButtonStyle.Primary, undefined, !streak),
        ]),
      };
    };

    const end = async (won: boolean, line: string) => {
      const payout = won ? pot : 0;
      const after = await payOut(userId, 'highlow', bet, payout);
      const kind = resultKind(bet, payout);
      return {
        embeds: [embed(kind).setTitle(`${titleIcon('highlow')} High-Low › ${won ? 'Cashed out' : 'Wrong'}`).setDescription([
          line, `${icon(kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success')} **${netText(bet, payout)}** after ${streak} correct`,
          `Bet ${coins(bet)} · Wallet ${coins(after.wallet)}`,
        ].join('\n'))],
        components: [row(btn(ids.nav(userId, 'c', 'casino'), 'Casino', NAV))],
      };
    };

    const message = await interaction.editReply(playing());
    let finished = false;
    const collector = collect(message, { time: 600_000, idle: 60_000 });
    collector.on('collect', (i) => {
      (async () => {
        if (finished) return i.deferUpdate();
        const move = i.customId.split(':')[2] as 'higher' | 'lower' | 'cash';
        if (move === 'cash') {
          finished = true;
          collector.stop('done');
          return i.update(await end(true, `You walked away with the pot.`));
        }
        const mult = highlowMultiplier(card.rank, move);
        if (!mult) return i.deferUpdate();
        const next = drawCard(defaultRng);
        const ok = highlowWins(card.rank, next.rank, move);
        history.push(cardText(card));
        const shown = `${cardText(card)} → **${cardText(next)}**`;
        card = next;
        if (!ok) {
          finished = true;
          collector.stop('done');
          return i.update(await end(false, `${shown}. You guessed ${move}.`));
        }
        streak++;
        pot = Math.floor(pot * mult);
        // The pot can't grow past the per-round cap: cash out for the player
        if (pot >= MAX_PAYOUT) {
          pot = MAX_PAYOUT;
          finished = true;
          collector.stop('done');
          return i.update(await end(true, `${shown}. The pot hit the ${coins(MAX_PAYOUT)} limit and was cashed out for you.`));
        }
        await i.update(playing(`${icon('success')} ${shown}. Correct!`));
      })().catch((err) => logError('highlow', err));
    });
    // Walked away: cash out what's in the pot (or the stake back before any guess)
    collector.on('end', (_c, reason) => {
      if (reason === 'done' || finished) return;
      finished = true;
      end(true, streak ? 'You walked away, so the pot was cashed out.' : 'No guess made, so your bet was returned.')
        .then((v) => interaction.editReply(v)).catch((err) => logError('highlow', err));
    });
  },
});

import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { canDouble, deal, double, handValue, hit, stand, type BlackjackState } from '../../game/gambling/blackjack';
import { cardText } from '../../game/gambling/cards';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { EconomyError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { defaultRng } from '../../lib/rng';
import { button, rows } from '../../lib/ui';
import { assertGamblingAllowed, netText, parseBet, payOut, placeOf, raiseBet, takeBet } from '../../services/gambling';
import { btn, ids, NAV, row } from '../../ui/kit';
import { resultKind } from './round';

const OUTCOME = { blackjack: 'Blackjack!', win: 'You win', push: 'Push', lose: 'Dealer wins', bust: 'Bust' } as const;

function hand(cards: BlackjackState['player'], hideHole = false): string {
  if (hideHole) return `${cardText(cards[0]!)} 🂠  (${handValue([cards[0]!]).total} + ?)`;
  return `${cards.map(cardText).join(' ')}  (${handValue(cards).total})`;
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('blackjack').setDescription('Beat the dealer without going over 21. Blackjack pays 3:2')
    .addStringOption((o) => o.setName('bet').setDescription('e.g. 500, 2.5k, half, all').setRequired(true)),
  category: 'gambling',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    await assertGamblingAllowed(interaction);
    const userId = interaction.user.id;
    const bet = parseBet(interaction.options.getString('bet', true), profile, 'blackjack');
    const opened = await takeBet(userId, 'blackjack', bet, placeOf(interaction));
    const roundId = opened.roundId;
    let wallet = opened.profile.wallet;
    const s = deal(defaultRng);
    let note: string | null = null;

    const view = async () => {
      const staked = s.doubled ? bet * 2 : bet;
      if (!s.done) {
        return {
          embeds: [embed('economy').setTitle(`${titleIcon('blackjack')} Blackjack`).setDescription([
            note, `**Dealer:** ${hand(s.dealer, true)}`, `**You:** ${hand(s.player)}`, '', `Bet ${coins(staked)}`,
          ].filter(Boolean).join('\n'))],
          components: rows([
            button('~bj', userId, ['hit'], 'Hit', ButtonStyle.Success),
            button('~bj', userId, ['stand'], 'Stand', ButtonStyle.Primary),
            button('~bj', userId, ['double'], canDouble(s) && wallet >= bet ? `Double · ${coins(bet)}` : 'Double', ButtonStyle.Secondary, undefined, !canDouble(s) || wallet < bet),
          ]),
        };
      }
      const payout = Math.floor(bet * s.payout);
      const after = await payOut(userId, 'blackjack', staked, payout, roundId);
      const kind = resultKind(staked, payout);
      return {
        embeds: [embed(kind).setTitle(`${titleIcon('blackjack')} Blackjack › ${OUTCOME[s.outcome!]}`).setDescription([
          `**Dealer:** ${hand(s.dealer)}`, `**You:** ${hand(s.player)}`, '',
          `${icon(kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success')} **${netText(staked, payout)}**`,
          `Bet ${coins(staked)} · Wallet ${coins(after.wallet)}`,
        ].join('\n'))],
        components: [row(btn(ids.nav(userId, 'c', 'casino'), 'Casino', NAV))],
      };
    };

    const message = await interaction.editReply(await view());
    if (s.done) return;
    let finished = false;
    const collector = collect(message, { time: 300_000, idle: 60_000 , disableOnEnd: false });
    collector.on('collect', (i) => {
      (async () => {
        if (finished) return i.deferUpdate();
        const move = i.customId.split(':')[2];
        note = null;
        if (move === 'hit') hit(s);
        else if (move === 'stand') stand(s);
        else if (move === 'double' && canDouble(s)) {
          try {
            wallet = (await raiseBet(userId, 'blackjack', roundId, bet)).wallet;
            double(s);
          } catch (err) {
            if (!(err instanceof EconomyError)) throw err;
            note = `${icon('warning')} You need ${coins(bet)} more to double.`;
          }
        }
        if (s.done) {
          finished = true;
          collector.stop('done');
        }
        await i.update(await view());
      })().catch((err) => logError('blackjack', err));
    });
    // Walked away: stand on what you have
    collector.on('end', (_c, reason) => {
      if (reason === 'done' || finished) return;
      finished = true;
      stand(s);
      note = null;
      view().then((v) => interaction.editReply(v)).catch((err) => logError('blackjack', err));
    });
  },
});

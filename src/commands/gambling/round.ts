import { ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { gameInfo, type GameId } from '../../content/gambling';
import type { IconKey } from '../../content/icons';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { EconomyError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button } from '../../lib/ui';
import { getProfile } from '../../services/economy';
import { netText, payOut, takeBet } from '../../services/gambling';
import { btn, ids, NAV, row } from '../../ui/kit';

export interface QuickResult {
  /** Total paid back as a multiple of the bet (0 = lost). */
  multiplier: number;
  /** The reveal (reels, coin, wheel). */
  reveal: string;
  /** One line describing what happened. */
  line: string;
}

/** Embed colour for a finished round. */
export function resultKind(bet: number, payout: number): 'success' | 'warning' | 'error' {
  return payout > bet ? 'success' : payout === bet ? 'warning' : 'error';
}

/**
 * A one-shot game (coinflip, slots, roulette): take the bet, show a short spin, pay out, and offer
 * "Again" with the same bet for a minute.
 */
export async function quickRound(interaction: ChatInputCommandInteraction, game: GameId, bet: number, play: () => QuickResult, spinning: string): Promise<void> {
  const userId = interaction.user.id;
  const title = `${titleIcon(game as IconKey)} ${gameInfo[game].name}`;

  const playOnce = async () => {
    await takeBet(userId, game, bet);
    const result = play();
    const payout = Math.floor(bet * result.multiplier);
    const profile = await payOut(userId, game, bet, payout);
    const kind = resultKind(bet, payout);
    const e = embed(kind).setTitle(`${title} › ${payout > bet ? 'Win' : payout === bet ? 'Push' : 'Loss'}`).setDescription([
      result.reveal,
      '',
      `${icon(kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success')} ${result.line} **${netText(bet, payout)}**`,
      `Bet ${coins(bet)} · Wallet ${coins(profile.wallet)}`,
    ].join('\n'));
    const again = profile.wallet >= bet;
    return {
      embeds: [e],
      components: [row(
        btn(ids.nav(userId, 'c', 'casino'), 'Casino', NAV),
        button('~again', userId, [], again ? `Again · ${coins(bet)}` : `Need ${coins(bet - profile.wallet)} more`, ButtonStyle.Success, undefined, !again),
      )],
    };
  };

  await interaction.editReply({ embeds: [embed('economy').setTitle(title).setDescription(spinning)], components: [] });
  await new Promise((r) => setTimeout(r, 900));
  const message = await interaction.editReply(await playOnce());

  const collector = collect(message, { time: 120_000, idle: 60_000 });
  collector.on('collect', (i) => {
    (async () => {
      await i.update({ embeds: [embed('economy').setTitle(title).setDescription(spinning)], components: [] });
      await new Promise((r) => setTimeout(r, 700));
      try {
        await i.editReply(await playOnce());
      } catch (err) {
        if (!(err instanceof EconomyError)) throw err;
        const p = await getProfile(userId);
        await i.editReply({ embeds: [embed('error').setTitle(title).setDescription(`${icon('error')} You need ${coins(bet)} to play again (wallet ${coins(p.wallet)}).`)], components: [] });
      }
    })().catch((err) => logError(game, err));
  });
}

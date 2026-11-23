import type { Client } from 'discord.js';
import { gameInfo, type GameId } from '../content/gambling';
import { embed } from '../lib/embeds';
import { coins } from '../lib/format';
import { icon } from '../lib/icons';
import { logError, logInfo } from '../lib/logger';
import { refundOpenRounds, type Refund } from '../services/rounds';

const label = (kind: string) => (kind in gameInfo ? gameInfo[kind as GameId].name : kind === 'duel' ? 'duel' : kind === 'heist' ? 'heist' : kind);

/**
 * At startup: refunds rounds a restart interrupted and tells each player, by DM or (if their DMs
 * are closed) in the channel the round was played in.
 */
export async function refundInterruptedRounds(client: Client<true>): Promise<void> {
  const refunds = await refundOpenRounds();
  if (!refunds.length) return;
  logInfo('refunds', `Refunded ${refunds.length} stake(s) from interrupted rounds`);
  const fallback = new Map<string, Refund[]>();
  for (const r of refunds) {
    const text = `${icon('success')} The bot restarted during your **${label(r.kind)}**, so your **${coins(r.amount)}** stake was refunded to your wallet.`;
    try {
      const user = await client.users.fetch(r.userId);
      await user.send({ embeds: [embed('success').setDescription(text)] });
    } catch {
      if (r.channelId) fallback.set(r.channelId, [...(fallback.get(r.channelId) ?? []), r]);
    }
  }
  for (const [channelId, list] of fallback) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isSendable()) {
        await channel.send({
          embeds: [embed('success').setDescription(list.map((r) => `${icon('success')} <@${r.userId}>: your **${coins(r.amount)}** ${label(r.kind)} stake was refunded after a bot restart.`).join('\n'))],
          allowedMentions: { users: list.map((r) => r.userId) },
        });
      }
    } catch (err) {
      logError('refund notice', err);
    }
  }
}

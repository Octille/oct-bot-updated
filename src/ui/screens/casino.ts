import { titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { gameInfo, houseEdge, MAX_PAYOUT, MIN_BET, maxBet, type GameId } from '../../content/gambling';
import { unlockLevel } from '../../services/progression';
import { back, row, type Payload } from '../kit';
import type { ScreenModule } from './types';

const GAMES = Object.keys(gameInfo) as GameId[];
const pct = (x: number) => `${(x * 100).toFixed(x < 0.02 ? 2 : 1)}%`;

/** casino: the games, their odds, your limits and your record. */
export const casino: ScreenModule = {
  render(_path, ctx): Payload {
    const p = ctx.profile;
    const level = unlockLevel(p);
    const g = p.stats?.gambling;
    const byGame = (g?.byGame ?? {}) as Record<string, { played: number; wagered: number; paidOut: number }>;
    const net = (g?.paidOut ?? 0) - (g?.wagered ?? 0);
    const e = embed('gambling').setTitle(`${titleIcon('casino')} Casino`).setDescription([
      ctx.note,
      `Bets from **${coins(MIN_BET)}**. Your max bet grows with your level; a single round pays at most ${coins(MAX_PAYOUT)}.`,
      '',
      ...GAMES.map((id) => {
        const info = gameInfo[id];
        const stats = byGame[id];
        return `**${info.name}** \`/${info.command}\` · house edge ${pct(houseEdge[id])}${id === 'highlow' ? ' per guess' : ''} · max bet ${coins(maxBet(id, level))}\n-# ${info.rules}${stats?.played ? ` · you: ${num(stats.played)} played, ${stats.paidOut - stats.wagered >= 0 ? '+' : '−'}${coins(Math.abs(stats.paidOut - stats.wagered))}` : ''}`;
      }),
      '',
      g?.played
        ? `**Your record:** ${num(g.played)} rounds · wagered ${coins(g.wagered)} · net **${net >= 0 ? '+' : '−'}${coins(Math.abs(net))}** · biggest win ${coins(g.biggestWin ?? 0)}`
        : "**Your record:** you haven't played yet.",
    ].filter((l) => l !== undefined).join('\n'))
      .setFooter({ text: 'The house always has an edge: over time you lose about that share of what you bet.' });
    return { embeds: [e], components: [row(back(ctx, null))] };
  },
};

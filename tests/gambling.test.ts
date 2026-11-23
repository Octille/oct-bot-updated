import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { coinflipPayout, gameInfo, houseEdge, levelMaxBet, MAX_PAYOUT, maxBet, maxMultiplier, type GameId, type RouletteBet } from '../src/content/gambling';
import { rouletteReturn, slotsReturn, spinSlots } from '../src/game/gambling/simple';
import { highlowChance, highlowMultiplier } from '../src/game/gambling/highlow';
import { crashPoint } from '../src/game/gambling/crash';
import { basicMove, deal, double, hit, stand } from '../src/game/gambling/blackjack';
import { seededRng } from '../src/lib/rng';
import { payOut, takeBet } from '../src/services/gambling';
import { getProfile } from '../src/services/economy';

const edge = (ret: number) => 1 - ret;

describe('house edge per game', () => {
  const table: string[] = [];

  it('coinflip: exactly 2.5%', () => {
    expect(edge(0.5 * coinflipPayout)).toBeCloseTo(houseEdge.coinflip, 6);
    table.push(`coinflip  ${(edge(0.5 * coinflipPayout) * 100).toFixed(2)}%  (exact)`);
  });

  it('slots: exact over every reel combination', () => {
    expect(edge(slotsReturn())).toBeCloseTo(houseEdge.slots, 3);
    // and the real spinner agrees
    const rng = seededRng(7);
    let paid = 0;
    const N = 400_000;
    for (let i = 0; i < N; i++) paid += spinSlots(rng).multiplier;
    expect(paid / N).toBeCloseTo(slotsReturn(), 2);
    table.push(`slots     ${(edge(slotsReturn()) * 100).toFixed(2)}%  (exact)`);
  });

  it('roulette: 2.70% on every kind of bet', () => {
    const bets: RouletteBet[] = [{ kind: 'red' }, { kind: 'black' }, { kind: 'odd' }, { kind: 'even' }, { kind: 'low' }, { kind: 'high' }, { kind: 'dozen', dozen: 2 }, { kind: 'number', number: 0 }, { kind: 'number', number: 17 }];
    for (const b of bets) expect(edge(rouletteReturn(b)), b.kind).toBeCloseTo(houseEdge.roulette, 6);
    table.push(`roulette  ${(houseEdge.roulette * 100).toFixed(2)}%  (exact, every bet)`);
  });

  it('crash: 3% whatever you cash out at; about 4% of rounds end at 1.00×', () => {
    const rng = seededRng(11);
    const N = 1_000_000;
    const points = Array.from({ length: N }, () => crashPoint(rng));
    // Points are rounded down to 2 decimals, so 1.000–1.009 all show as 1.00×: 1 − 0.97/1.01 ≈ 3.96%
    expect(points.filter((p) => p === 1).length / N).toBeCloseTo(1 - 0.97 / 1.01, 2);
    for (const target of [1.5, 2, 5, 10]) {
      const ret = (points.filter((p) => p >= target).length / N) * target;
      expect(ret, `cash out at ${target}×`).toBeGreaterThan(0.955);
      expect(ret, `cash out at ${target}×`).toBeLessThan(0.985);
    }
    table.push('crash     3.00%  (exact by formula; simulated 1M rounds)');
  });

  it('blackjack: about 1.1% with basic strategy (S17, 3:2, double any two, no split)', () => {
    const rng = seededRng(42);
    const N = 300_000;
    let net = 0;
    for (let i = 0; i < N; i++) {
      const s = deal(rng);
      while (!s.done) {
        const m = basicMove(s);
        if (m === 'double') double(s);
        else if (m === 'hit') hit(s);
        else stand(s);
      }
      net += s.payout - (s.doubled ? 2 : 1);
    }
    const e = -net / N;
    expect(e).toBeGreaterThan(houseEdge.blackjack - 0.008);
    expect(e).toBeLessThan(houseEdge.blackjack + 0.008);
    table.push(`blackjack ${(e * 100).toFixed(2)}%  (simulated 300k hands; published ${(houseEdge.blackjack * 100).toFixed(2)}% from 2M)`);
  });

  it('high-low: every allowed guess returns 96–97% (3% per guess); guesses paying ≤1× are disabled', () => {
    for (let rank = 1; rank <= 13; rank++) {
      for (const g of ['higher', 'lower'] as const) {
        const m = highlowMultiplier(rank, g);
        if (m === null) {
          expect(0.97 / highlowChance(rank, g)).toBeLessThanOrEqual(1.0001);
          continue;
        }
        const ret = m * highlowChance(rank, g);
        expect(ret, `${rank} ${g}`).toBeLessThanOrEqual(0.97);
        expect(ret, `${rank} ${g}`).toBeGreaterThan(0.955);
      }
    }
    table.push('highlow   3.00%  per guess (exact)');
    console.log(`\nHouse edge\n${table.join('\n')}`);
  });
});

describe('limits', () => {
  it('no game can pay more than the per-round cap at its max bet', () => {
    for (const level of [0, 10, 35, 100]) {
      for (const game of Object.keys(gameInfo) as GameId[]) {
        // Roulette's default limit is for outside bets (≤3×); single numbers are checked below
        const mult = game === 'roulette' ? 3 : maxMultiplier[game];
        expect(maxBet(game, level) * mult, `${game} lvl ${level}`).toBeLessThanOrEqual(MAX_PAYOUT);
        expect(maxBet(game, level)).toBeLessThanOrEqual(levelMaxBet(level));
      }
      expect(maxBet('roulette', level, 'number') * 36).toBeLessThanOrEqual(MAX_PAYOUT);
    }
  });
});

describe('bets (database)', () => {
  useTestDatabase();

  it('two all-in bets at once: only one goes through', async () => {
    await User.create({ _id: 'g1', wallet: 10_000 });
    const tries = await Promise.allSettled([takeBet('g1', 'slots', 10_000), takeBet('g1', 'coinflip', 10_000)]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    expect((await getProfile('g1')).wallet).toBe(0);
  });

  it('pays out, counts stats and caps a round at the max payout', async () => {
    await User.create({ _id: 'g2', wallet: 1_000 });
    const r1 = await takeBet('g2', 'coinflip', 1_000);
    await payOut('g2', 'coinflip', 1_000, 1_950, r1.roundId);
    const r2 = await takeBet('g2', 'crash', 1_000);
    await payOut('g2', 'crash', 1_000, 999_999_999, r2.roundId);
    // Paying the same round twice does nothing
    await payOut('g2', 'crash', 1_000, 999_999_999, r2.roundId);
    const p = await getProfile('g2');
    expect(p.wallet).toBe(950 + MAX_PAYOUT);
    expect(p.stats?.gambling).toMatchObject({ played: 2, wagered: 2_000, paidOut: 1_950 + MAX_PAYOUT, biggestWin: MAX_PAYOUT - 1_000 });
    expect((p.stats?.gambling?.byGame as Record<string, { played: number }>).coinflip?.played).toBe(1);
  });
});

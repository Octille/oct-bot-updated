import { blackjackRules } from '../../content/gambling';
import type { Rng } from '../../lib/rng';
import { makeShoe, type Card } from './cards';

export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += Math.min(10, c.rank);
    if (c.rank === 1) aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export const isBlackjack = (cards: readonly Card[]) => cards.length === 2 && handValue(cards).total === 21;

export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BlackjackState {
  shoe: Card[];
  player: Card[];
  dealer: Card[];
  doubled: boolean;
  done: boolean;
  outcome: BlackjackOutcome | null;
  /** Multiple of the original bet paid back (0 when lost). */
  payout: number;
}

export function deal(rng: Rng): BlackjackState {
  const shoe = makeShoe(blackjackRules.decks, rng);
  const s: BlackjackState = { shoe, player: [shoe.pop()!, shoe.pop()!], dealer: [shoe.pop()!, shoe.pop()!], doubled: false, done: false, outcome: null, payout: 0 };
  if (isBlackjack(s.player) || isBlackjack(s.dealer)) finish(s);
  return s;
}

export function canDouble(s: BlackjackState): boolean {
  return !s.done && s.player.length === 2;
}

export function hit(s: BlackjackState): BlackjackState {
  if (s.done) return s;
  s.player.push(s.shoe.pop()!);
  if (handValue(s.player).total > 21) finish(s);
  else if (handValue(s.player).total === 21) stand(s);
  return s;
}

export function double(s: BlackjackState): BlackjackState {
  if (!canDouble(s)) return s;
  s.doubled = true;
  s.player.push(s.shoe.pop()!);
  if (handValue(s.player).total > 21) return finish(s);
  return stand(s);
}

export function stand(s: BlackjackState): BlackjackState {
  if (s.done) return s;
  for (;;) {
    const { total, soft } = handValue(s.dealer);
    if (total < 17 || (total === 17 && soft && blackjackRules.dealerHitsSoft17)) s.dealer.push(s.shoe.pop()!);
    else break;
  }
  return finish(s);
}

function finish(s: BlackjackState): BlackjackState {
  const stake = s.doubled ? 2 : 1;
  const p = handValue(s.player).total;
  const d = handValue(s.dealer).total;
  if (isBlackjack(s.player) && !isBlackjack(s.dealer)) [s.outcome, s.payout] = ['blackjack', 1 + blackjackRules.blackjackPays];
  else if (isBlackjack(s.dealer) && !isBlackjack(s.player)) [s.outcome, s.payout] = ['lose', 0];
  else if (isBlackjack(s.player)) [s.outcome, s.payout] = ['push', 1];
  else if (p > 21) [s.outcome, s.payout] = ['bust', 0];
  else if (d > 21 || p > d) [s.outcome, s.payout] = ['win', 2 * stake];
  else if (p === d) [s.outcome, s.payout] = ['push', stake];
  else [s.outcome, s.payout] = ['lose', 0];
  s.done = true;
  return s;
}

/** Basic strategy (no split): the move a sensible player makes. Used by the edge simulation. */
export function basicMove(s: BlackjackState): 'hit' | 'stand' | 'double' {
  const { total, soft } = handValue(s.player);
  const up = Math.min(10, s.dealer[0]!.rank) === 1 ? 11 : Math.min(10, s.dealer[0]!.rank);
  const first = s.player.length === 2;
  if (soft) {
    if (total >= 19) return 'stand';
    if (total === 18) return first && up >= 3 && up <= 6 ? 'double' : up >= 9 ? 'hit' : 'stand';
    if (first && ((total >= 15 && up >= 4 && up <= 6) || (total >= 13 && up >= 5 && up <= 6) || (total === 17 && up === 3))) return 'double';
    return 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return up <= 6 ? 'stand' : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (total === 11) return first ? 'double' : 'hit';
  if (total === 10) return first && up <= 9 ? 'double' : 'hit';
  if (total === 9) return first && up >= 3 && up <= 6 ? 'double' : 'hit';
  return 'hit';
}

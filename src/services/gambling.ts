import type { ChatInputCommandInteraction } from 'discord.js';
import { MAX_PAYOUT, MIN_BET, gameInfo, maxBet, type GameId, type RouletteBet } from '../content/gambling';
import { parseAmount } from '../lib/amount';
import { UserError } from '../lib/errors';
import { coins } from '../lib/format';
import { getGuildSettings } from '../models/GuildSettings';
import { apply, getProfile, inTransaction, type Profile } from './economy';
import { addRoundStake, closeRound, openRound, type RoundPlace } from './rounds';
import { unlockLevel } from './progression';

/* ── Per-server switch (cached for a minute) ────────────────────────────────────────────── */

const enabledCache = new Map<string, { at: number; enabled: boolean }>();

export async function gamblingEnabled(guildId: string): Promise<boolean> {
  const hit = enabledCache.get(guildId);
  if (hit && Date.now() - hit.at < 60_000) return hit.enabled;
  const enabled = (await getGuildSettings(guildId))?.gamblingEnabled !== false;
  enabledCache.set(guildId, { at: Date.now(), enabled });
  return enabled;
}

export function invalidateGambling(guildId: string): void {
  enabledCache.delete(guildId);
}

/** Throws a friendly error when gambling is switched off in this server. */
export async function assertGamblingAllowed(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.guildId && !(await gamblingEnabled(interaction.guildId))) {
    throw new UserError('Gambling is switched off in this server.');
  }
}

/* ── Bets ───────────────────────────────────────────────────────────────────────────────── */

export function maxBetFor(profile: Profile, game: GameId, rouletteKind?: RouletteBet['kind']): number {
  return maxBet(game, unlockLevel(profile), rouletteKind);
}

/** Parses "500", "2.5k", "half", "all" (all = as much as you can bet). */
export function parseBet(input: string, profile: Profile, game: GameId, rouletteKind?: RouletteBet['kind']): number {
  const max = maxBetFor(profile, game, rouletteKind);
  const parsed = parseAmount(input, Math.min(profile.wallet, max));
  if (!parsed.ok) throw new UserError(parsed.reason);
  const bet = parsed.value;
  if (bet < MIN_BET) throw new UserError(`The minimum bet is **${coins(MIN_BET)}**.`);
  if (bet > max) throw new UserError(`Your max bet on ${gameInfo[game].name} is **${coins(max)}** (it grows with your account level).`);
  if (bet > profile.wallet) throw new UserError(`You only have **${coins(profile.wallet)}** in your wallet.`);
  return bet;
}

function betChange(game: GameId, bet: number, newRound: boolean) {
  const rounds = newRound ? 1 : 0;
  return {
    wallet: -bet,
    inc: {
      'stats.gambling.played': rounds,
      'stats.gambling.wagered': bet,
      [`stats.gambling.byGame.${game}.played`]: rounds,
      [`stats.gambling.byGame.${game}.wagered`]: bet,
    },
  };
}

/**
 * Takes the bet (atomically: fails if the wallet can't cover it), counts the round and records it
 * as open, so a restart before the payout refunds it.
 */
export async function takeBet(userId: string, game: GameId, bet: number, place: RoundPlace = { guildId: null, channelId: null }): Promise<{ profile: Profile; roundId: string }> {
  return inTransaction(async (session) => {
    const profile = await apply(userId, betChange(game, bet, true), { source: `gamble.${game}.bet`, meta: { bet }, session });
    const roundId = await openRound(game, [{ userId, amount: bet }], place, session);
    return { profile, roundId };
  });
}

/** A blackjack double: more stake on the same round. */
export async function raiseBet(userId: string, game: GameId, roundId: string, extra: number): Promise<Profile> {
  return inTransaction(async (session) => {
    const profile = await apply(userId, betChange(game, extra, false), { source: `gamble.${game}.bet`, meta: { bet: extra }, session });
    await addRoundStake(roundId, userId, extra, session);
    return profile;
  });
}

/**
 * Pays a round out (`payout` is the total returned, including the stake; 0 for a loss) and closes
 * it in the same transaction. If the round was already refunded, nothing is paid.
 */
export async function payOut(userId: string, game: GameId, bet: number, payout: number, roundId: string): Promise<Profile> {
  const paid = Math.min(MAX_PAYOUT, Math.max(0, Math.floor(payout)));
  return inTransaction(async (session) => {
    if (!(await closeRound(roundId, session))) return getProfile(userId, session);
    return apply(userId, {
      inc: { 'stats.gambling.paidOut': paid, [`stats.gambling.byGame.${game}.paidOut`]: paid },
      ...(paid ? { wallet: paid } : {}),
      max: paid > bet ? { 'stats.gambling.biggestWin': paid - bet } : undefined,
    }, { source: `gamble.${game}.payout`, meta: { bet, payout: paid }, session });
  });
}

/** Where a round is being played (for the refund notice). */
export function placeOf(interaction: { guildId: string | null; channelId: string | null }): RoundPlace {
  return { guildId: interaction.guildId, channelId: interaction.channelId };
}

/** "+₪1,950" / "−₪1,000" / "±₪0" */
export function netText(bet: number, payout: number): string {
  const net = Math.floor(payout) - bet;
  return net > 0 ? `+${coins(net)}` : net < 0 ? `−${coins(-net)}` : `±${coins(0)}`;
}

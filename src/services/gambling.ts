import type { ChatInputCommandInteraction } from 'discord.js';
import { MAX_PAYOUT, MIN_BET, gameInfo, maxBet, type GameId, type RouletteBet } from '../content/gambling';
import { parseAmount } from '../lib/amount';
import { UserError } from '../lib/errors';
import { coins } from '../lib/format';
import { getGuildSettings } from '../models/GuildSettings';
import { apply, type Profile } from './economy';
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

/** Takes the bet (atomically: fails if the wallet can't cover it) and counts the round. */
export async function takeBet(userId: string, game: GameId, bet: number): Promise<Profile> {
  return apply(userId, {
    wallet: -bet,
    inc: {
      'stats.gambling.played': 1,
      'stats.gambling.wagered': bet,
      [`stats.gambling.byGame.${game}.played`]: 1,
      [`stats.gambling.byGame.${game}.wagered`]: bet,
    },
  }, { source: `gamble.${game}.bet`, meta: { bet } });
}

/** Pays a round out (`payout` is the total returned, including the stake; 0 for a loss). */
export async function payOut(userId: string, game: GameId, bet: number, payout: number): Promise<Profile> {
  const paid = Math.min(MAX_PAYOUT, Math.max(0, Math.floor(payout)));
  return apply(userId, {
    wallet: paid || undefined,
    inc: { 'stats.gambling.paidOut': paid, [`stats.gambling.byGame.${game}.paidOut`]: paid },
    max: paid > bet ? { 'stats.gambling.biggestWin': paid - bet } : undefined,
  }, { source: `gamble.${game}.payout`, meta: { bet, payout: paid } });
}

/** "+₪1,950" / "−₪1,000" / "±₪0" */
export function netText(bet: number, payout: number): string {
  const net = Math.floor(payout) - bet;
  return net > 0 ? `+${coins(net)}` : net < 0 ? `−${coins(-net)}` : `±${coins(0)}`;
}

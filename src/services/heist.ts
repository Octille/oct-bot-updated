import { heistRules } from '../content/social';
import { defaultRng, type Rng } from '../lib/rng';
import { User } from '../models/User';
import * as cooldowns from './cooldowns';
import { apply, inTransaction, type Profile } from './economy';
import { closeRound, openRound, type RoundPlace } from './rounds';
import { isJailed } from './jail';
import { unlockLevel } from './progression';
import { altBlocker } from './antiAlt';

/** Why a player can't join, or null if they can. */
export function heistBlocker(p: Profile | null, now = Date.now()): string | null {
  if (!p) return "You haven't played yet. Try `/daily` first.";
  const alt = altBlocker(p._id, p, 'You', now);
  if (alt) return alt;
  if (unlockLevel(p) < heistRules.minLevel) return `Heists unlock at account level ${heistRules.minLevel}.`;
  if (isJailed(p.jailUntil, now)) return "You're in jail.";
  if (p.wallet < heistRules.stake) return `You need ${heistRules.stake.toLocaleString('en-US')} Octs in your wallet for your stake.`;
  const cd = ((p.cooldowns ?? {}) as Record<string, Date>).heist;
  if (cd && new Date(cd).getTime() > now) return 'You were in a heist recently. Lie low for a while.';
  return null;
}

export interface HeistResult {
  crew: string[];
  dropped: string[];
  success: boolean;
  chance: number;
  jailed: string[];
}

/**
 * Starts the heist: claims every member's cooldown, takes all stakes in one transaction (members
 * who can't pay any more are dropped), rolls once, then pays out or jails, also in one transaction.
 */
export async function runHeist(memberIds: string[], rng: Rng = defaultRng, place: RoundPlace = { guildId: null, channelId: null }): Promise<HeistResult | { tooFew: true; dropped: string[] }> {
  const dropped: string[] = [];
  let crew: string[] = [];
  for (const id of memberIds) {
    const p = (await User.findById(id, null, { lean: true })) as unknown as Profile | null;
    if (heistBlocker(p)) { dropped.push(id); continue; }
    const claim = await cooldowns.claim(id, 'heist', heistRules.cooldownHours * 3_600_000);
    if (claim.ok) crew.push(id);
    else dropped.push(id);
  }
  const release = (ids: string[]) => Promise.all(ids.map((id) => cooldowns.release(id, 'heist').catch(() => undefined)));
  if (crew.length < heistRules.minCrew) {
    await release(crew);
    return { tooFew: true, dropped };
  }

  // Take every stake at once; if someone spent theirs meanwhile, drop them and try again once
  // Stakes and the open-round record commit together, so a restart before the payout refunds them
  let roundId = '';
  const takeStakes = (ids: string[]) => inTransaction(async (session) => {
    for (const id of ids) await apply(id, { wallet: -heistRules.stake, inc: { 'stats.heists': 1 } }, { source: 'heist.stake', session });
    roundId = await openRound('heist', ids.map((userId) => ({ userId, amount: heistRules.stake })), place, session);
  });
  try {
    await takeStakes(crew);
  } catch {
    const still: string[] = [];
    for (const id of crew) {
      const p = await User.findById(id, { wallet: 1 }, { lean: true });
      if ((p?.wallet ?? 0) >= heistRules.stake) still.push(id);
      else dropped.push(id);
    }
    await release(crew.filter((id) => !still.includes(id)));
    crew = still;
    if (crew.length < heistRules.minCrew) {
      await release(crew);
      return { tooFew: true, dropped };
    }
    await takeStakes(crew);
  }

  const chance = heistRules.chance(crew.length);
  const success = rng.next() < chance;
  const jailed: string[] = [];
  if (!success) for (const id of crew) if (rng.next() < heistRules.jailChance) jailed.push(id);
  const payout = Math.floor(heistRules.stake * heistRules.payout);
  const until = new Date(Date.now() + heistRules.jailMinutes * 60_000);
  await inTransaction(async (session) => {
    if (!(await closeRound(roundId, session))) return; // already refunded
    if (success) for (const id of crew) await apply(id, { wallet: payout, inc: { 'stats.heistsWon': 1 } }, { source: 'heist.payout', session, meta: { crew: crew.length } });
    for (const id of jailed) await apply(id, { set: { jailUntil: until } }, { source: 'heist.jail', session });
  });
  return { crew, dropped, success, chance, jailed };
}

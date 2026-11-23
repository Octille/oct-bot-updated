import { getCosmetic } from '../content/cosmetics';
import { economyConfig } from '../content/economy';
import { MAX_PRESTIGE, perks, prestigeCosmeticCost, prestigeLevel, tokensFor, type PerkId } from '../content/prestige';
import { UserError } from '../lib/errors';
import { apply, getProfile, type Profile } from './economy';

export type PrestigeCheck = { ok: true } | { ok: false; reason: string };

export function canPrestige(p: Profile): PrestigeCheck {
  const current = p.account?.prestige ?? 0;
  if (current >= MAX_PRESTIGE) return { ok: false, reason: `You're at the maximum prestige (${MAX_PRESTIGE}).` };
  if ((p.account?.level ?? 0) < prestigeLevel) return { ok: false, reason: `Reach account level ${prestigeLevel} to prestige (you're ${p.account?.level ?? 0}).` };
  return { ok: true };
}

/**
 * Prestiges: level and XP back to 0, wallet back to the starting amount, bank emptied.
 * One conditional update, guarded on the level and the current prestige, so a double-click can't
 * prestige twice. Coin changes go through the transaction log like any other.
 */
export async function prestige(userId: string): Promise<{ profile: Profile; prestige: number; tokens: number; lost: number }> {
  const p = await getProfile(userId);
  const check = canPrestige(p);
  if (!check.ok) throw new UserError(check.reason);
  const current = p.account?.prestige ?? 0;
  const next = current + 1;
  const tokens = tokensFor(next);
  const walletDelta = economyConfig.startingWallet - p.wallet;
  const profile = await apply(userId, {
    wallet: walletDelta || undefined,
    bank: p.bank ? -p.bank : undefined,
    set: { 'account.xp': 0, 'account.level': 0 },
    inc: { 'account.prestige': 1, 'prestige.tokens': tokens },
    max: { 'account.best': p.account?.level ?? 0 },
    where: { 'account.prestige': current, 'account.level': { $gte: prestigeLevel } },
  }, { source: 'prestige', meta: { to: next } });
  return { profile, prestige: next, tokens, lost: p.wallet + p.bank - economyConfig.startingWallet };
}

export async function buyPerk(userId: string, id: PerkId): Promise<Profile> {
  const perk = perks.find((x) => x.id === id);
  if (!perk) throw new UserError("That perk doesn't exist.");
  const p = await getProfile(userId);
  if ((p.account?.prestige ?? 0) < perk.minPrestige) throw new UserError(`${perk.name} needs prestige ${perk.minPrestige}.`);
  if (p.prestige?.perks?.includes(id)) throw new UserError(`You already have ${perk.name}.`);
  if ((p.prestige?.tokens ?? 0) < perk.cost) throw new UserError(`You need ${perk.cost} prestige token${perk.cost === 1 ? '' : 's'}.`);
  return apply(userId, {
    inc: { 'prestige.tokens': -perk.cost },
    addToSet: { 'prestige.perks': [id] },
    where: { 'prestige.tokens': { $gte: perk.cost }, 'prestige.perks': { $ne: id } },
  }, { source: 'prestige.perk', meta: { id } });
}

export async function buyPrestigeCosmetic(userId: string, id: string): Promise<Profile> {
  const c = getCosmetic(id);
  const cost = prestigeCosmeticCost[id];
  if (!c || c.exclusive !== 'prestige' || cost === undefined) throw new UserError("That isn't in the prestige shop.");
  const p = await getProfile(userId);
  if ((p.account?.prestige ?? 0) < (c.minPrestige ?? 1)) throw new UserError(`${c.name} needs prestige ${c.minPrestige}.`);
  if (p.cosmetics?.owned?.includes(id)) throw new UserError(`You already own ${c.name}.`);
  if ((p.prestige?.tokens ?? 0) < cost) throw new UserError(`You need ${cost} prestige token${cost === 1 ? '' : 's'}.`);
  return apply(userId, {
    inc: { 'prestige.tokens': -cost },
    addToSet: { 'cosmetics.owned': [id] },
    where: { 'prestige.tokens': { $gte: cost }, 'cosmetics.owned': { $ne: id } },
  }, { source: 'prestige.cosmetic', meta: { id } });
}

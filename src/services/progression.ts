import { accountXp, levelFromXp, prestigeIncomeBonus, type XpSource } from '../content/levels';
import { perkEffect, type PerkId } from '../content/prestige';
import { boostEffect } from '../content/consumables';
import { levelCrate } from '../content/crates';
import { itemName } from '../content/items';
import { isActive } from '../game/boosts';
import { jobs } from '../content/jobs';
import { pickaxes, rods } from '../content/tools';
import { User } from '../models/User';
import { defaultRng, randInt, type Rng } from '../lib/rng';
import { apply, type Change, type Profile } from './economy';

type BoostSource = Pick<Profile, 'account'> & Partial<Pick<Profile, 'boosts' | 'prestige'>>;
type PerkSource = Partial<Pick<Profile, 'boosts' | 'prestige'>>;

export function hasPerk(profile: PerkSource, perk: PerkId): boolean {
  return profile.prestige?.perks?.includes(perk) ?? false;
}

/** The level unlocks are checked against: your best-ever level, so prestiging never re-locks anything. */
export function unlockLevel(profile: Partial<Pick<Profile, 'account'>>): number {
  return Math.max(profile.account?.level ?? 0, profile.account?.best ?? 0);
}

/** Multiplier on all coin income: prestige, the Golden Touch perk and an active coin boost. */
export function incomeMultiplier(profile: BoostSource): number {
  const prestige = 1 + (profile.account?.prestige ?? 0) * prestigeIncomeBonus;
  const perk = hasPerk(profile, 'golden_touch') ? 1 + perkEffect.incomeMult : 1;
  return prestige * perk * (isActive(profile.boosts, 'coin') ? boostEffect.coinMult : 1);
}

export function xpMultiplier(profile: PerkSource): number {
  const perk = hasPerk(profile, 'scholar') ? 1 + perkEffect.xpMult : 1;
  return perk * (isActive(profile.boosts, 'xp') ? boostEffect.xpMult : 1);
}

/** Extra luck points from an active luck potion and the Lucky Charm perk. */
export function luckBonus(profile: PerkSource): number {
  return (isActive(profile.boosts, 'luck') ? boostEffect.luckPoints : 0) + (hasPerk(profile, 'lucky_charm') ? perkEffect.luckPoints : 0);
}

export function rollXp(source: XpSource, rng: Rng = defaultRng, mult = 1): number {
  const [min, max] = accountXp[source];
  return Math.round(randInt(min, max, rng) * mult);
}

/** What unlocks when reaching levels in (from, to]. */
export function unlocksBetween(from: number, to: number): string[] {
  const inRange = (level: number) => level > from && level <= to;
  return [
    ...jobs.filter((j) => inRange(j.level)).map((j) => `${j.name} job`),
    ...pickaxes.filter((t) => inRange(t.level)).map((t) => t.name),
    ...rods.filter((t) => inRange(t.level)).map((t) => t.name),
  ];
}

export interface LevelUp {
  from: number;
  to: number;
  unlocks: string[];
  /** Crates awarded for milestone levels. */
  crates: string[];
}

export interface GrantResult {
  profile: Profile;
  xp: number;
  levelUp: LevelUp | null;
}

/**
 * Pays out an action: coins/items/stats and account XP in one atomic update,
 * then records any level-up.
 */
export async function grant(
  userId: string,
  change: Change,
  opts: { source: string; xp?: XpSource; meta?: Record<string, unknown>; rng?: Rng; profile?: PerkSource },
): Promise<GrantResult> {
  const xp = opts.xp ? rollXp(opts.xp, opts.rng, opts.profile ? xpMultiplier(opts.profile) : 1) : 0;
  const profile = await apply(
    userId,
    {
      ...change,
      inc: {
        ...change.inc,
        ...(xp ? { 'account.xp': xp } : {}),
        // Coins earned from activities, for "Earn ₪X" quests
        ...(change.wallet && change.wallet > 0 ? { 'stats.earned': change.wallet } : {}),
      },
    },
    { source: opts.source, meta: opts.meta },
  );
  const levelUp = await syncLevel(profile);
  return { profile, xp, levelUp };
}

/**
 * Raises the stored level to match total XP. `$max` keeps it safe under concurrent grants.
 * Crates and unlock messages only count levels above your best-ever level, so they aren't
 * paid or announced again after a prestige.
 */
export async function syncLevel(profile: Profile): Promise<LevelUp | null> {
  const stored = profile.account?.level ?? 0;
  const { level } = levelFromXp(profile.account?.xp ?? 0);
  if (level <= stored) return null;
  const before = await User.findOneAndUpdate(
    { _id: profile._id, 'account.level': { $lt: level } },
    { $max: { 'account.level': level, 'account.best': level } },
    { new: false, lean: true, projection: { account: 1 } },
  );
  if (!before) return null; // another grant already announced it
  const from = before.account?.level ?? 0;
  const best = Math.max(from, before.account?.best ?? 0);

  // Milestone levels give a crate. Only the call that won the $max above gets here, so it's paid once.
  const crates: string[] = [];
  for (let l = best + 1; l <= level; l++) {
    const crate = levelCrate(l);
    if (crate) crates.push(crate);
  }
  if (crates.length) {
    const items: Record<string, number> = {};
    for (const c of crates) items[c] = (items[c] ?? 0) + 1;
    await apply(profile._id, { items }, { source: 'level.crate', meta: { from, to: level } });
  }
  const crateUnlocks = crates.map((c) => `a free ${itemName(c)}`);
  return { from, to: level, unlocks: [...unlocksBetween(best, level), ...crateUnlocks], crates };
}

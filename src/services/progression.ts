import { accountXp, levelFromXp, prestigeIncomeBonus, type XpSource } from '../content/levels';
import { jobs } from '../content/jobs';
import { pickaxes, rods } from '../content/tools';
import { User } from '../models/User';
import { defaultRng, randInt, type Rng } from '../lib/rng';
import { apply, type Change, type Profile } from './economy';

/** Multiplier on all coin income (prestige now; boosts arrive with items). */
export function incomeMultiplier(profile: Pick<Profile, 'account'>): number {
  return 1 + (profile.account?.prestige ?? 0) * prestigeIncomeBonus;
}

export function rollXp(source: XpSource, rng: Rng = defaultRng): number {
  const [min, max] = accountXp[source];
  return randInt(min, max, rng);
}

/** What unlocks when reaching levels in (from, to]. */
export function unlocksBetween(from: number, to: number): string[] {
  const inRange = (level: number) => level > from && level <= to;
  return [
    ...jobs.filter((j) => inRange(j.level)).map((j) => `${j.emoji} **${j.name}** job (\`/job\`)`),
    ...pickaxes.filter((t) => inRange(t.level)).map((t) => `${t.emoji} **${t.name}** (\`/tools\`)`),
    ...rods.filter((t) => inRange(t.level)).map((t) => `${t.emoji} **${t.name}** (\`/tools\`)`),
  ];
}

export interface LevelUp {
  from: number;
  to: number;
  unlocks: string[];
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
  opts: { source: string; xp?: XpSource; meta?: Record<string, unknown>; rng?: Rng },
): Promise<GrantResult> {
  const xp = opts.xp ? rollXp(opts.xp, opts.rng) : 0;
  const profile = await apply(
    userId,
    { ...change, inc: { ...change.inc, ...(xp ? { 'account.xp': xp } : {}) } },
    { source: opts.source, meta: opts.meta },
  );
  const levelUp = await syncLevel(profile);
  return { profile, xp, levelUp };
}

/** Raises the stored level to match total XP. `$max` keeps it safe under concurrent grants. */
export async function syncLevel(profile: Profile): Promise<LevelUp | null> {
  const stored = profile.account?.level ?? 0;
  const { level } = levelFromXp(profile.account?.xp ?? 0);
  if (level <= stored) return null;
  const before = await User.findOneAndUpdate(
    { _id: profile._id, 'account.level': { $lt: level } },
    { $max: { 'account.level': level } },
    { new: false, lean: true, projection: { 'account.level': 1 } },
  );
  if (!before) return null; // another grant already announced it
  const from = before.account?.level ?? 0;
  return { from, to: level, unlocks: unlocksBetween(from, level) };
}

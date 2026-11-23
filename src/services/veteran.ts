import { veteranCosmetics, veteranInfo, type VeteranTier } from '../content/veteran';
import { User } from '../models/User';
import { apply, type Profile } from './economy';

/**
 * Grants a veteran tier and its cosmetics (plus the lower tiers'). Called only by the v2 → v3
 * migration; there is no way to earn these after launch. The badge is equipped by default so
 * veterans stand out; they can hide it in the Wardrobe.
 */
export async function grantVeteran(userId: string, tier: VeteranTier): Promise<Profile> {
  return apply(userId, {
    set: { 'veteran.tier': tier, 'cosmetics.badge': veteranInfo[tier].badge },
    addToSet: { 'cosmetics.owned': veteranCosmetics(tier) },
  }, { source: 'veteran.grant', meta: { tier } });
}

/** Marks the welcome-back message as shown. Returns the tier only the first time. */
export async function claimVeteranWelcome(userId: string): Promise<VeteranTier | null> {
  const before = await User.findOneAndUpdate(
    { _id: userId, 'veteran.tier': { $ne: null }, 'veteran.welcomed': { $ne: true } },
    { $set: { 'veteran.welcomed': true } },
    { new: false, lean: true, projection: { veteran: 1 } },
  );
  return (before?.veteran?.tier as VeteranTier | null | undefined) ?? null;
}

/**
 * Premium (Phase 8, not built yet). Every premium check in the bot goes through these two
 * functions, so turning on either PLAN §10 option is a change here plus the perks themselves.
 * Always false for now.
 */

export interface PremiumUser {
  _id: string;
}

export interface PremiumServer {
  guildId: string;
}

/** Whether a player has VIP. */
export function isPremium(_user: PremiumUser): boolean {
  return false;
}

/** Whether a server has server VIP. */
export function isPremiumServer(_server: PremiumServer): boolean {
  return false;
}

/** /crime — pick your risk. Failing means a fine (from your wallet) and jail time. */

export interface Crime {
  id: string;
  name: string;
  emoji: string;
  success: number;
  payout: [number, number];
  fine: number;
  jailMinutes: number;
  /** Chance a successful job also turns up loot you can only get from crime. */
  dropChance: number;
  successLines: string[];
  failLines: string[];
}

export const crimeUnlockLevel = 3;

export const crimes: readonly Crime[] = [
  {
    id: 'pickpocket', name: 'Pickpocket', emoji: '👛', success: 0.75, payout: [300, 700], fine: 300, jailMinutes: 2, dropChance: 0.04,
    successLines: ['You lifted a wallet off a tourist taking selfies.', 'Smooth. They never felt a thing.'],
    failLines: ['You grabbed a wallet. It was attached to a police officer.', 'The "tourist" was a mall cop.'],
  },
  {
    id: 'shoplift', name: 'Shoplift', emoji: '🛒', success: 0.55, payout: [800, 1_800], fine: 800, jailMinutes: 5, dropChance: 0.07,
    successLines: ['You walked out with a TV under your coat. Somehow.', 'Self checkout, but you skipped the paying part.'],
    failLines: ['The alarm went off as you hit the door.', 'You tripped over the security tag cable.'],
  },
  {
    id: 'hack', name: 'Hack an ATM', emoji: '💻', success: 0.35, payout: [3_000, 6_000], fine: 2_000, jailMinutes: 10, dropChance: 0.12,
    successLines: ['The ATM coughs up a stack of crisp Octs.', 'Firmware 1.0.0, no password. Payday.'],
    failLines: ['The ATM printed a receipt reading "CALLING POLICE". Then it did.', 'Your laptop died mid-hack. So did your luck.'],
  },
];

/** Crime-only loot (item ids in items.ts), weighted. Riskier crimes roll more often, not better. */
export const crimeLoot = [
  { itemId: 'crime_watch', weight: 70 },
  { itemId: 'crime_ring', weight: 22 },
  { itemId: 'crime_bond', weight: 7 },
  { itemId: 'crime_painting', weight: 1 },
] as const;

/** Paying your way out of jail costs this much per remaining minute (minimum one minute). */
export const bailPerMinute = 400;

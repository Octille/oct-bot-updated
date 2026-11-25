/**
 * Business: one per player. Workers earn while you're away, up to an offline cap. Collecting pays
 * out after upkeep, sometimes with a random event. A manager raises the cap and collects for you.
 */

export type BusinessTier = 'stand' | 'truck' | 'cafe' | 'factory';

export const businessTiers: { id: BusinessTier; name: string; emoji: string; level: number; price: number; perWorkerHour: number; maxWorkers: number }[] = [
  { id: 'stand', name: 'Lemonade Stand', emoji: '🍋', level: 5, price: 15_000, perWorkerHour: 45, maxWorkers: 10 },
  { id: 'truck', name: 'Food Truck', emoji: '🚚', level: 12, price: 75_000, perWorkerHour: 90, maxWorkers: 10 },
  { id: 'cafe', name: 'Café', emoji: '☕', level: 20, price: 250_000, perWorkerHour: 130, maxWorkers: 10 },
  { id: 'factory', name: 'Factory', emoji: '🏭', level: 30, price: 750_000, perWorkerHour: 180, maxWorkers: 10 },
];

export const businessRules = {
  /** Hiring the nth worker (0-based) costs hireBase × tier price share × growth^n. */
  hireShare: 0.08,
  hireGrowth: 1.15,
  offlineCapHours: 8,
  managerCapHours: 24,
  /** Manager price as a share of the tier price. */
  managerShare: 0.5,
  /** The manager collects for you once this much has built up. */
  managerCollectHours: 6,
  /** Share of income spent on upkeep (wages, rent). */
  upkeep: 0.1,
  /** Random events when collecting (they average out to about 1×). Upgrading keeps workers. */
  events: [
    { id: 'rush', weight: 6, mult: 1.5, line: 'Rush hour! Customers everywhere.' },
    { id: 'viral', weight: 1, mult: 2, line: 'Someone posted about you and it went viral.' },
    { id: 'inspection', weight: 5, mult: 0.7, line: 'A surprise inspection slowed things down.' },
    { id: 'broken', weight: 4, mult: 0.5, line: 'Equipment broke. Repairs ate into the takings.' },
    { id: 'none', weight: 84, mult: 1, line: '' },
  ],
} as const;

/**
 * Upgrading keeps your workers, but you pay the difference in what they'd cost to hire at the new
 * tier (otherwise filling the cheapest tier and upgrading would skip all the expensive hiring).
 */
export function upgradeCost(from: BusinessTier | null, to: BusinessTier, workers: number): number {
  const t = businessTiers.find((x) => x.id === to)!;
  let extra = 0;
  for (let n = 0; n < workers; n++) extra += hireCost(to, n) - (from ? hireCost(from, n) : 0);
  return t.price + Math.max(0, extra);
}

export function hireCost(tier: BusinessTier, workers: number): number {
  const t = businessTiers.find((x) => x.id === tier)!;
  return Math.round((t.price * businessRules.hireShare * businessRules.hireGrowth ** workers) / 100) * 100;
}

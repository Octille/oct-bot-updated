/** Pets: one per player. Keep them happy (≥ 50) for their perk, which grows with their level. */

export type PetSpecies = 'dog' | 'cat' | 'parrot' | 'octopus';

export const pets: Record<PetSpecies, { name: string; emoji: string; price: number; perk: string; perkAtMax: number }> = {
  dog: { name: 'Dog', emoji: '🐕', price: 40_000, perk: 'Robbers have a lower chance against you', perkAtMax: 0.1 },
  cat: { name: 'Cat', emoji: '🐈', price: 40_000, perk: 'Extra luck on fish, hunt, mine and dig', perkAtMax: 1 },
  parrot: { name: 'Parrot', emoji: '🦜', price: 40_000, perk: 'More coins from every activity', perkAtMax: 0.05 },
  octopus: { name: 'Octopus', emoji: '🐙', price: 60_000, perk: 'More account XP', perkAtMax: 0.1 },
};

export const petRules = {
  minLevel: 5,
  maxLevel: 10,
  /** XP to the next pet level. */
  xpToNext: (level: number) => 100 * level,
  /** Happiness lost per hour since it was last cared for. */
  decayPerHour: 2,
  happyAt: 50,
  feed: { cost: 500, happiness: 30, xp: 20, cooldownHours: 4 },
  play: { happiness: 15, xp: 10, cooldownHours: 2 },
} as const;

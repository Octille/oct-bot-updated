/** Server events: chat drops, weekly boss raids and community goals, and monthly seasons. */

/** Activities that count for community goals and season points (grant() sources). */
export const ACTIVITY_SOURCES = ['work', 'mine', 'fish', 'hunt', 'dig', 'beg', 'search', 'crime'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

/* ── Chat drops ─────────────────────────────────────────────────────────────────────────── */
export const dropRules = {
  /** Distinct people who must have chatted in the channel recently (no solo farming). */
  minChatters: 3,
  chatWindowMinutes: 10,
  /** Admins pick 1–6 per hour per channel; this is the default. */
  defaultPerHour: 2,
  maxPerHour: 6,
  /** Once the interval has passed, each qualifying message has this chance to spawn one. */
  chancePerMessage: 0.15,
  expireSeconds: 60,
  /** Per player per UTC day. */
  dailyCap: 10,
  coins: [300, 1_500] as [number, number],
  crateChance: 0.1,
} as const;

/* ── Boss raids (weekly, per server) ────────────────────────────────────────────────────── */
export const bosses = [
  { id: 'kraken', name: 'The Kraken', emoji: '🦑', line: 'Tentacles burst out of the harbour.' },
  { id: 'robot', name: 'Rogue Mining Robot', emoji: '🤖', line: 'Something in the mines has started drilling back.' },
  { id: 'taxman', name: 'The Tax Collector', emoji: '💼', line: "He's here for everyone's wallet." },
  { id: 'crab', name: 'Colossal Crab', emoji: '🦀', line: 'The beach is closed. Indefinitely.' },
] as const;

export const raidRules = {
  /** HP per player active in the server in the last week (min 3). */
  hpPerPlayer: 6_000,
  minPlayers: 3,
  attackCooldownMinutes: 30,
  /** Damage per attack: (base + perLevel × level) × 0.8–1.2, ×1.25 with a weapon equipped. */
  damage: { base: 100, perLevel: 25, weaponMult: 1.25 },
  /** Rewards when the boss is defeated: everyone who hit it. */
  reward: { base: 3_000, perShare: 30_000, crate: 'crate_common', top3: 'crate_rare', mvp: 'crate_epic' },
  /** Raids run Monday 00:00 → Wednesday 00:00 UTC. */
  hours: 48,
  seasonPointsPerAttack: 3,
} as const;

/* ── Community goals (weekly, per server) ───────────────────────────────────────────────── */
export const goalTypes = [
  { metric: 'fish', label: 'Catch {n} fish together', perPlayer: 30 },
  { metric: 'mine', label: 'Go mining {n} times together', perPlayer: 25 },
  { metric: 'work', label: 'Work {n} shifts together', perPlayer: 20 },
  { metric: 'hunt', label: 'Bag {n} animals together', perPlayer: 15 },
  { metric: 'dig', label: 'Dig {n} plots together', perPlayer: 10 },
] as const;

export const goalRules = {
  minPlayers: 3,
  /** Contributions needed to share the reward. */
  minContribution: 5,
  reward: { coins: 8_000, crate: 'crate_rare' },
} as const;

/* ── Seasons ────────────────────────────────────────────────────────────────────────────── */
export const seasonRules = {
  /** Default length; ANTI-style env override SEASON_LENGTH_DAYS for testing. */
  lengthDays: 30,
  points: { activity: 1, dailyQuest: 5, weeklyQuest: 20, raidAttack: raidRules.seasonPointsPerAttack },
  /** Players need at least this many points to place. */
  minPoints: 50,
  rewards: [
    { from: 1, to: 1, coins: 250_000, crate: 'crate_legendary', badge: 'badge_season_champion', title: 'Champion' },
    { from: 2, to: 3, coins: 100_000, crate: 'crate_epic', badge: 'badge_season_top10', title: 'Top 3' },
    { from: 4, to: 10, coins: 50_000, crate: 'crate_epic', badge: 'badge_season_top10', title: 'Top 10' },
    { from: 11, to: 100, coins: 10_000, crate: 'crate_rare', badge: 'badge_season_top100', title: 'Top 100' },
  ],
} as const;

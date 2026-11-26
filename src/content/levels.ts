/** Account level (global, from game actions). Separate from per-server chat levels. */

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(100 + 35 * level + 3.1 * level * level);
}

/** Total XP needed to reach `level` from 0. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpToNext(l);
  return total;
}

/** Level for a total XP amount, plus progress into the current level. */
export function levelFromXp(totalXp: number): { level: number; into: number; needed: number } {
  let level = 0;
  let rest = totalXp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level) };
}

/** Account XP per action, [min, max]. */
export const accountXp = {
  beg: [2, 5],
  search: [4, 8],
  work: [20, 35],
  mine: [12, 20],
  fish: [8, 15],
  hunt: [6, 10],
  dig: [6, 10],
  crime: [5, 9],
  daily: [60, 60],
  weekly: [250, 250],
} as const satisfies Record<string, readonly [number, number]>;

export type XpSource = keyof typeof accountXp;

/** Each prestige adds this much to all coin income. Prestige itself arrives in Phase 3. */
export const prestigeIncomeBonus = 0.05;

/* ── Server (chat) levels: per server, from messages and voice ─────────────────────────── */

/** XP to go from server level `level` to `level + 1`. */
export function serverXpToNext(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export function serverLevelFromXp(totalXp: number): { level: number; into: number; needed: number } {
  let level = 0;
  let rest = totalXp;
  while (rest >= serverXpToNext(level)) {
    rest -= serverXpToNext(level);
    level++;
  }
  return { level, into: rest, needed: serverXpToNext(level) };
}

export function totalServerXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += serverXpToNext(l);
  return total;
}

export const chatXp = {
  /** XP per counted message, [min, max]. */
  message: [15, 25] as const,
  /** Only one message per user per server counts in this window. */
  cooldownSeconds: 60,
  /** XP per minute in voice, when at least one other eligible person is in the channel. */
  voicePerMinute: 10,
  /** Channel/role multipliers admins can set. */
  minMult: 0.5,
  maxMult: 3,
} as const;

/** Account level (global, from game actions). Separate from per-server chat levels. */

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 100 + 60 * level + 8 * level * level;
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
  daily: [60, 60],
  weekly: [250, 250],
} as const satisfies Record<string, readonly [number, number]>;

export type XpSource = keyof typeof accountXp;

/** Each prestige adds this much to all coin income. Prestige itself arrives in Phase 3. */
export const prestigeIncomeBonus = 0.05;

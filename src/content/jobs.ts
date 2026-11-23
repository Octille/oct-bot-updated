export interface Job {
  id: string;
  name: string;
  emoji: string;
  /** Account level needed to take the job. */
  level: number;
  /** Pay for an average shift before rank and performance multipliers. */
  basePay: number;
  /** Minigame difficulty, 1–5. */
  difficulty: number;
  /** Words for the unscramble minigame. */
  words: readonly string[];
}

export const jobs: readonly Job[] = [
  { id: 'barista', name: 'Barista', emoji: '☕', level: 0, basePay: 500, difficulty: 1,
    words: ['latte', 'mocha', 'beans', 'cream', 'sugar', 'brew', 'froth', 'decaf', 'cups', 'roast'] },
  { id: 'coder', name: 'Coder', emoji: '💻', level: 5, basePay: 850, difficulty: 2,
    words: ['debug', 'array', 'stack', 'merge', 'class', 'async', 'regex', 'cache', 'build', 'query'] },
  { id: 'chef', name: 'Chef', emoji: '👨‍🍳', level: 10, basePay: 2150, difficulty: 3,
    words: ['sauce', 'knife', 'grill', 'onion', 'pasta', 'whisk', 'spice', 'steak', 'broth', 'flour'] },
  { id: 'doctor', name: 'Doctor', emoji: '🩺', level: 20, basePay: 3000, difficulty: 4,
    words: ['nurse', 'pulse', 'scalp', 'nerve', 'tonic', 'virus', 'organ', 'lungs', 'serum', 'xrays'] },
  { id: 'ceo', name: 'CEO', emoji: '💼', level: 35, basePay: 3900, difficulty: 5,
    words: ['stock', 'board', 'merger', 'yacht', 'brand', 'profit', 'equity', 'growth', 'assets', 'shares'] },
];

/** Promotion ladder inside each job, by shifts worked in that job. */
export const jobRanks = [
  { shifts: 0, title: 'Trainee', mult: 1 },
  { shifts: 10, title: 'Junior', mult: 1.1 },
  { shifts: 30, title: 'Senior', mult: 1.25 },
  { shifts: 75, title: 'Lead', mult: 1.4 },
  { shifts: 150, title: 'Legend', mult: 1.6 },
] as const;

/** Pay multiplier from the minigame: failing still pays a little; fast wins pay more. */
export const performance = {
  fail: 0.35,
  /** Success pays between these, scaled by how quickly you answered. */
  slowest: 0.75,
  fastest: 1.25,
} as const;

/** Each minigame's time limit in seconds (everything stays under 10s). */
export const minigameTimeLimit = 9;

export function getJob(id: string | null | undefined): Job {
  return jobs.find((j) => j.id === id) ?? jobs[0]!;
}

export function rankFor(shifts: number) {
  let rank: (typeof jobRanks)[number] = jobRanks[0];
  for (const r of jobRanks) if (shifts >= r.shifts) rank = r;
  return rank;
}

export function nextRank(shifts: number) {
  return jobRanks.find((r) => r.shifts > shifts) ?? null;
}

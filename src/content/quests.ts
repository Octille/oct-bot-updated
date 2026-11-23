/**
 * Daily and weekly quests. Progress is the growth of a stat since the quest was handed out
 * (a snapshot is stored with it), so activities need no extra tracking.
 */

export type QuestScope = 'daily' | 'weekly';

export interface QuestDef {
  id: string;
  /** "Work {n} shifts" */
  label: string;
  /** Path under `stats` (e.g. `worked`, `crimeWins.hack`). */
  stat: string;
  /** Target range per scope; a scope the quest isn't in is left out. */
  daily?: [number, number];
  weekly?: [number, number];
  /** Targets that grow with level (coins): target = base + perLevel × level, rounded. */
  scaled?: { daily?: [number, number]; weekly?: [number, number] };
  /** The hub activity it advances (for the "suggested next" button). */
  activity?: string;
  /** Only offered when the player can do it. */
  needs?: 'weapon' | 'shovel' | 'crime';
}

export const questDefs: readonly QuestDef[] = [
  { id: 'work', label: 'Work {n} shifts', stat: 'worked', daily: [3, 5], weekly: [20, 30], activity: 'work' },
  { id: 'perfect', label: 'Get {n} perfect shift(s)', stat: 'perfectShifts', daily: [1, 1], weekly: [5, 8], activity: 'work' },
  { id: 'mine', label: 'Go mining {n} times', stat: 'mined', daily: [3, 6], weekly: [25, 35], activity: 'mine' },
  { id: 'fish', label: 'Catch {n} fish', stat: 'fishCaught', daily: [4, 8], weekly: [30, 45], activity: 'fish' },
  { id: 'hunt', label: 'Bag {n} animals', stat: 'hunted', daily: [2, 4], weekly: [15, 25], activity: 'hunt', needs: 'weapon' },
  { id: 'dig', label: 'Dig {n} plots', stat: 'digs', daily: [2, 3], weekly: [10, 15], activity: 'dig', needs: 'shovel' },
  { id: 'treasure', label: 'Dig up {n} treasures', stat: 'treasures', weekly: [3, 5], activity: 'dig', needs: 'shovel' },
  { id: 'beg', label: 'Beg {n} times', stat: 'begged', daily: [4, 8], activity: 'beg' },
  { id: 'search', label: 'Search {n} times', stat: 'searched', daily: [3, 6], activity: 'search' },
  { id: 'crime', label: 'Commit {n} crimes', stat: 'crimes', daily: [2, 3], weekly: [12, 18], activity: 'crime', needs: 'crime' },
  // Fish only: shop items sell back below cost, so an "any item" sell quest could be bought outright
  { id: 'sell', label: 'Sell {n} fish', stat: 'fishSold', daily: [3, 8], weekly: [25, 40], activity: 'fish' },
  { id: 'earn', label: 'Earn {n} coins from activities', stat: 'earned', scaled: { daily: [5_000, 1_500], weekly: [40_000, 12_000] } },
  { id: 'chat', label: 'Send {n} messages that earn XP', stat: 'messages', daily: [10, 20] },
  { id: 'dailies', label: 'Finish {n} daily quests', stat: 'questsDone', weekly: [10, 15] },
];

export const questsPerSet = 3;

/** Rewards per quest and for finishing the whole set (the bonus chest). Quests are ~15% of income (BALANCE.md). */
export const questRewards = {
  daily: { coins: (level: number) => 250 + 75 * level, xp: 40, bonus: (_level: number) => 'crate_common' },
  weekly: { coins: (level: number) => 1_500 + 350 * level, xp: 250, bonus: (level: number) => (level >= 35 ? 'crate_epic' : 'crate_rare') },
} as const;

/** Rerolls per set (a new random quest replaces one you haven't finished). */
export const questRerolls = { daily: 1, weekly: 1 } as const;

/** DM reminders (opt-in): at most one per kind per day/week. */
export const reminderRules = {
  /** UTC hour for players who never claimed a daily and didn't pick an hour. */
  defaultHour: 12,
} as const;

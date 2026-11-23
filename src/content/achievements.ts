import { fishSpecies } from './fishing';
import type { Profile } from '../services/economy';

/**
 * Achievements: each has a goal and reads its progress from the profile, so nothing extra is stored
 * besides the unlock time (`achievements.<id>`). Hidden ones show as "???" until unlocked.
 */

export type AchievementCategory = 'activities' | 'crime' | 'collection' | 'progress' | 'social';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  goal: number;
  progress(p: Profile): number;
  hidden?: boolean;
  reward: { coins?: number; item?: string; cosmetic?: string };
}

type Stats = Record<string, number | Record<string, number> | undefined>;
const stat = (path: string) => (p: Profile): number => {
  const [a, b] = path.split('.') as [string, string | undefined];
  const v = (p.stats as unknown as Stats | undefined)?.[a];
  return (b ? (v as Record<string, number> | undefined)?.[b] : (v as number | undefined)) ?? 0;
};
// Best-ever level, so prestiging doesn't undo progress (best defaults to 0, so take the max)
const level = (p: Profile) => Math.max(p.account?.level ?? 0, p.account?.best ?? 0);
const prestige = (p: Profile) => p.account?.prestige ?? 0;
const species = (p: Profile) => Object.keys((p.fishdex ?? {}) as Record<string, unknown>).length;
const coinsHeld = (p: Profile) => (p.wallet ?? 0) + (p.bank ?? 0);

const a = (id: string, name: string, description: string, category: AchievementCategory, goal: number, progress: (p: Profile) => number, reward: Achievement['reward'], hidden = false): Achievement =>
  ({ id, name, description, category, goal, progress, reward, ...(hidden ? { hidden } : {}) });

export const achievements: readonly Achievement[] = [
  // Work
  a('first_shift', 'First Shift', 'Work your first shift', 'activities', 1, stat('worked'), { coins: 500 }),
  a('regular', 'Regular', 'Work 50 shifts', 'activities', 50, stat('worked'), { coins: 5_000 }),
  a('workaholic', 'Workaholic', 'Work 250 shifts', 'activities', 250, stat('worked'), { coins: 25_000, cosmetic: 'title_workaholic' }),
  a('flawless', 'Flawless', 'Get 25 perfect shifts', 'activities', 25, stat('perfectShifts'), { coins: 10_000 }),
  // Mining
  a('first_ore', 'Strike the Earth', 'Go mining for the first time', 'activities', 1, stat('mined'), { coins: 300 }),
  a('rock_collector', 'Rock Collector', 'Mine 50 times', 'activities', 50, stat('mined'), { coins: 5_000 }),
  a('deep_delver', 'Deep Delver', 'Mine 500 times', 'activities', 500, stat('mined'), { coins: 30_000, cosmetic: 'title_deep_delver' }),
  a('shiny', 'Shiny!', 'Find 10 gems', 'activities', 10, stat('gemsFound'), { item: 'crate_rare' }),
  a('hard_hat', 'Hard Hat Required', 'Survive 10 cave-ins', 'activities', 10, stat('caveIns'), { coins: 5_000 }, true),
  // Fishing
  a('first_catch', 'First Catch', 'Catch your first fish', 'activities', 1, stat('fishCaught'), { coins: 300 }),
  a('angler', 'Angler', 'Catch 100 fish', 'activities', 100, stat('fishCaught'), { coins: 8_000 }),
  a('old_salt', 'Old Salt', 'Catch 1,000 fish', 'activities', 1_000, stat('fishCaught'), { coins: 40_000, cosmetic: 'title_old_salt' }),
  a('got_away', 'The One That Got Away', 'Lose 50 fish', 'activities', 50, stat('fishLost'), { coins: 2_000 }, true),
  // Hunting
  a('first_hunt', 'First Hunt', 'Bag your first animal', 'activities', 1, stat('hunted'), { coins: 300 }),
  a('tracker', 'Tracker', 'Hunt 100 animals', 'activities', 100, stat('hunted'), { coins: 8_000 }),
  a('big_game', 'Big Game Hunter', 'Hunt 500 animals', 'activities', 500, stat('hunted'), { coins: 30_000, cosmetic: 'title_big_game' }),
  a('stormtrooper', 'Stormtrooper', 'Miss 50 shots', 'activities', 50, stat('missedHunts'), { coins: 1_000 }, true),
  // Digging, begging, searching
  a('groundskeeper', 'Groundskeeper', 'Dig 50 plots', 'activities', 50, stat('digs'), { coins: 5_000 }),
  a('x_marks', 'X Marks the Spot', 'Dig up your first treasure', 'activities', 1, stat('treasures'), { coins: 2_000 }),
  a('treasure_hunter', 'Treasure Hunter', 'Dig up 50 treasures', 'activities', 50, stat('treasures'), { coins: 30_000, cosmetic: 'title_treasure_hunter' }),
  a('shameless', 'Shameless', 'Beg 100 times', 'activities', 100, stat('begged'), { coins: 3_000 }),
  a('couch_diver', 'Couch Diver', 'Search 100 times', 'activities', 100, stat('searched'), { coins: 5_000 }),
  // Crime
  a('first_offense', 'First Offense', 'Commit your first crime', 'crime', 1, stat('crimes'), { coins: 500 }),
  a('light_fingers', 'Light Fingers', 'Pull off 50 pickpockets', 'crime', 50, stat('crimeWins.pickpocket'), { cosmetic: 'title_light_fingers' }),
  a('master_hacker', 'Master Hacker', 'Hack 25 ATMs', 'crime', 25, stat('crimeWins.hack'), { cosmetic: 'title_master_hacker' }),
  a('art_thief', 'Art Thief', 'Steal The Mona Octa', 'crime', 1, stat('crimeLootItems.crime_painting'), { cosmetic: 'title_art_thief' }, true),
  a('repeat_offender', 'Repeat Offender', 'Get arrested 25 times', 'crime', 25, stat('crimesFailed'), { cosmetic: 'title_repeat_offender' }),
  a('fence', 'The Fence', 'Turn up 25 pieces of crime loot', 'crime', 25, stat('crimeLoot'), { coins: 10_000 }),
  // Collection and economy
  a('curious_angler', 'Curious Angler', 'Discover 10 fish species', 'collection', 10, species, { coins: 5_000 }),
  a('completionist', 'Completionist', 'Discover every fish species', 'collection', fishSpecies.length, species, { cosmetic: 'title_completionist' }),
  a('six_figures', 'Six Figures', 'Hold ₪100,000 in your wallet and bank', 'collection', 100_000, coinsHeld, { coins: 5_000 }),
  a('millionaire', 'Millionaire', 'Hold ₪1,000,000 in your wallet and bank', 'collection', 1_000_000, coinsHeld, { item: 'crate_epic' }),
  a('merchant', 'Merchant', 'Sell 1,000 items', 'collection', 1_000, stat('itemsSold'), { coins: 15_000 }),
  a('unboxer', 'Unboxer', 'Open 10 crates', 'collection', 10, stat('cratesOpened'), { coins: 3_000 }),
  a('crate_addict', 'Crate Addict', 'Open 100 crates', 'collection', 100, stat('cratesOpened'), { item: 'crate_rare' }),
  a('fashionista', 'Fashionista', 'Own 10 cosmetics', 'collection', 10, (p) => p.cosmetics?.owned?.length ?? 0, { coins: 10_000 }),
  // Progress
  a('getting_started', 'Getting Started', 'Reach account level 5', 'progress', 5, level, { coins: 1_000 }),
  a('climbing', 'Climbing', 'Reach account level 10', 'progress', 10, level, { coins: 2_500 }),
  a('seasoned', 'Seasoned', 'Reach account level 25', 'progress', 25, level, { coins: 25_000 }),
  a('peak', 'Peak Performance', 'Reach account level 35', 'progress', 35, level, { coins: 50_000 }),
  a('born_again', 'Born Again', 'Prestige for the first time', 'progress', 1, prestige, { coins: 25_000 }),
  a('ascension', 'Ascension', 'Reach prestige 5', 'progress', 5, prestige, { item: 'crate_legendary' }),
  a('endless', 'Endless', 'Reach prestige 10', 'progress', 10, prestige, { cosmetic: 'bg_abyss' }),
  a('habit', 'Habit', 'Reach a 7-day daily streak', 'progress', 7, (p) => p.streak?.best ?? 0, { coins: 3_000 }),
  a('committed', 'Committed', 'Reach a 30-day daily streak', 'progress', 30, (p) => p.streak?.best ?? 0, { item: 'crate_epic' }),
  a('dedicated', 'Dedicated', 'Reach a 100-day daily streak', 'progress', 100, (p) => p.streak?.best ?? 0, { cosmetic: 'title_dedicated' }),
  a('frozen', 'Saved by the Freeze', 'Have a streak freeze save your streak', 'progress', 1, stat('streakFreezesUsed'), { coins: 1_000 }, true),
  // Social (chat and voice XP, any server)
  a('say_hi', 'Say Hi', 'Send 100 messages that earn XP', 'social', 100, stat('messages'), { coins: 1_000 }),
  a('chatterbox', 'Chatterbox', 'Send 1,000 messages that earn XP', 'social', 1_000, stat('messages'), { coins: 10_000, cosmetic: 'title_chatterbox' }),
  a('talk_it_out', 'Talk It Out', 'Spend 10 hours in voice', 'social', 600, stat('voiceMinutes'), { coins: 5_000 }),
];

export const achievementById = new Map(achievements.map((x) => [x.id, x]));

export const categoryLabel: Record<AchievementCategory, string> = {
  activities: 'Activities', crime: 'Crime', collection: 'Collection', progress: 'Progress', social: 'Social',
};

/** The activity that progresses each (non-hidden) achievement; the hub uses it to suggest what to do next. */
export const achievementActivity: Record<string, string> = {
  first_shift: 'work', regular: 'work', workaholic: 'work', flawless: 'work',
  first_ore: 'mine', rock_collector: 'mine', deep_delver: 'mine', shiny: 'mine',
  first_catch: 'fish', angler: 'fish', old_salt: 'fish', curious_angler: 'fish', completionist: 'fish',
  first_hunt: 'hunt', tracker: 'hunt', big_game: 'hunt',
  groundskeeper: 'dig', x_marks: 'dig', treasure_hunter: 'dig',
  shameless: 'beg', couch_diver: 'search',
  first_offense: 'crime', light_fingers: 'crime', master_hacker: 'crime', fence: 'crime',
  habit: 'daily', committed: 'daily', dedicated: 'daily',
};

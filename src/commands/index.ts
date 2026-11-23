import type { SlashCommand } from '../framework/types';
import ping from './utility/ping';
import balance from './economy/balance';
import bank from './economy/bank';
import daily from './economy/daily';
import weekly from './economy/weekly';
import streak from './economy/streak';
import work from './economy/work';
import job from './economy/job';
import mine from './economy/mine';
import fish from './economy/fish';
import fishdex from './economy/fishdex';
import tools from './economy/tools';
import beg from './economy/beg';
import search from './economy/search';

/** Every slash command. Add new commands here. */
export const commands: SlashCommand[] = [
  ping,
  balance, bank, daily, weekly, streak,
  work, job, mine, fish, fishdex, tools, beg, search,
];

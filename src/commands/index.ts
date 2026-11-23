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
import hunt from './economy/hunt';
import dig from './economy/dig';
import crime from './economy/crime';
import bail from './economy/bail';
import inventory from './economy/inventory';
import iteminfo from './economy/iteminfo';
import sell from './economy/sell';
import use from './economy/use';
import shop from './economy/shop';
import buy from './economy/buy';
import cosmetics from './economy/cosmetics';

/** Every slash command. Add new commands here. */
export const commands: SlashCommand[] = [
  ping,
  balance, bank, daily, weekly, streak,
  work, job, mine, fish, fishdex, tools, beg, search,
  hunt, dig, crime, bail,
  inventory, iteminfo, sell, use, shop, buy, cosmetics,
];

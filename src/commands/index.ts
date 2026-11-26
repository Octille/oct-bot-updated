import type { SlashCommand } from '../framework/types';
import ping from './utility/ping';
import help from './utility/help';
import menu from './utility/menu';
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
import quests from './economy/quests';
import pet from './economy/pet';
import business from './economy/business';
import raid from './events/raid';
import play from './music/play';
import musicCmd from './music/music';
import banCmd from './moderation/ban';
import unbanCmd from './moderation/unban';
import kickCmd from './moderation/kick';
import timeoutCmd from './moderation/timeout';
import untimeoutCmd from './moderation/untimeout';
import purgeCmd from './moderation/purge';
import warnCmd from './moderation/warn';
import warningsCmd from './moderation/warnings';
import season from './events/season';
import rank from './levels/rank';
import profileCmd from './levels/profile';
import achievementsCmd from './levels/achievements';
import prestigeCmd from './levels/prestige';
import levels from './levels/levels';
import leaderboard from './levels/leaderboard';
import coinflip from './gambling/coinflip';
import slots from './gambling/slots';
import blackjack from './gambling/blackjack';
import highlow from './gambling/highlow';
import roulette from './gambling/roulette';
import crash from './gambling/crash';
import casino from './gambling/casino';
import settings from './admin/settings';
import rolepanel from './admin/rolepanel';
import afk from './utility/afk';
import avatar from './utility/avatar';
import userinfo from './utility/userinfo';
import serverinfo from './utility/serverinfo';
import poll from './utility/poll';
import rob from './social/rob';
import heist from './social/heist';
import duel from './social/duel';
import trade from './social/trade';
import give from './social/give';
import gift from './social/gift';

/** Every slash command. Add new commands here. */
export const commands: SlashCommand[] = [
  menu, help, ping, afk, avatar, userinfo, serverinfo, poll,
  balance, bank, daily, weekly, streak,
  work, job, mine, fish, fishdex, tools, beg, search,
  hunt, dig, crime, bail,
  inventory, iteminfo, sell, use, shop, buy, cosmetics, quests, pet, business,
  raid, season,
  play, musicCmd,
  banCmd, unbanCmd, kickCmd, timeoutCmd, untimeoutCmd, purgeCmd, warnCmd, warningsCmd,
  rank, profileCmd, achievementsCmd, prestigeCmd, levels, leaderboard,
  casino, coinflip, slots, blackjack, highlow, roulette, crash,
  rob, heist, duel, trade, give, gift,
  settings, rolepanel,
];

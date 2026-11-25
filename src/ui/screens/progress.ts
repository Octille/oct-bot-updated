import { titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { achievements } from '../../content/achievements';
import { prestigeNumerals } from '../../content/prestige';
import { unlockedAt } from '../../services/achievements';
import { unlockLevel } from '../../services/progression';
import { back, btn, ids, NAV, row, type Payload } from '../kit';
import type { ScreenModule } from './types';

/** Prestige shows from this level (or once you've prestiged), like in the menu. */
const PRESTIGE_LEVEL = 30;

/** progress: achievements, leaderboards, season and prestige in one place. */
export const progressScreen: ScreenModule = {
  render(_path, ctx): Payload {
    const p = ctx.profile;
    const unlocked = achievements.filter((a) => unlockedAt(p, a.id)).length;
    const prestige = p.account?.prestige ?? 0;
    const showPrestige = unlockLevel(p) >= PRESTIGE_LEVEL || prestige > 0;
    const e = embed('levels').setTitle(`${titleIcon('achievements')} Progress`).setDescription([
      ctx.note,
      `**Achievements:** ${unlocked} / ${achievements.length}`,
      `**Prestige:** ${prestige ? prestigeNumerals[prestige] : 'none yet'}`,
      '',
      'Leaderboards and the season show live standings.',
    ].filter((l) => l !== undefined).join('\n'));
    return {
      embeds: [e],
      components: [row(
        back(ctx, null),
        btn(ids.nav(ctx.owner, ctx.origin, 'ach'), 'Achievements', NAV),
        btn(ids.go(ctx.owner, 'leaderboard'), 'Leaderboards', NAV),
        btn(ids.go(ctx.owner, 'season'), 'Season', NAV),
        ...(showPrestige ? [btn(ids.nav(ctx.owner, ctx.origin, 'prestige'), 'Prestige', NAV)] : []),
      )],
    };
  },
};

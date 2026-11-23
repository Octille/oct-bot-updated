import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { bar, num } from '../../lib/format';
import { achievements, categoryLabel, type AchievementCategory } from '../../content/achievements';
import { rewardText, unlockedAt } from '../../services/achievements';
import { back, btn, ids, NAV, row, select, type Payload } from '../kit';
import type { ScreenModule } from './types';

const PER_PAGE = 8;
const CATEGORIES = Object.keys(categoryLabel) as AchievementCategory[];

/** ach · ach.<category>.<page> */
export const achievementsScreen: ScreenModule = {
  render(path, ctx): Payload {
    const p = ctx.profile;
    const category = CATEGORIES.includes(path[1] as AchievementCategory) ? (path[1] as AchievementCategory) : 'activities';
    const all = achievements.filter((a) => a.category === category);
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    const page = Math.min(pages - 1, Math.max(0, Number(path[2]) || 0));
    const total = achievements.filter((a) => unlockedAt(p, a.id)).length;

    const lines = all.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((a) => {
      const at = unlockedAt(p, a.id);
      if (at) return `${icon('success')} **${a.name}** · ${a.description}\n-# Unlocked <t:${Math.floor(new Date(at).getTime() / 1000)}:d> · ${rewardText(a)}`;
      if (a.hidden) return `${icon('locked')} **???** · Hidden achievement`;
      const progress = Math.min(a.goal, a.progress(p));
      return `${icon('locked')} **${a.name}** · ${a.description}\n-# ${bar(progress, a.goal, 8)} ${num(progress)} / ${num(a.goal)} · ${rewardText(a)}`;
    });

    const inCategory = all.filter((a) => unlockedAt(p, a.id)).length;
    const e = embed('levels')
      .setTitle(`${titleIcon('achievements')} Achievements › ${categoryLabel[category]}`)
      .setDescription([ctx.note, `**${total} / ${achievements.length}** unlocked · ${inCategory} / ${all.length} in ${categoryLabel[category]}`, '', ...lines].filter((l) => l !== undefined).join('\n'))
      .setFooter({ text: `Page ${page + 1} of ${pages} · Hidden achievements show once you unlock them.` });

    const nav = [back(ctx, null)];
    if (pages > 1) {
      nav.push(
        btn(ids.nav(ctx.owner, ctx.origin, `ach.${category}.${page - 1}`), 'Prev', NAV, { disabled: page === 0 }),
        btn(ids.nav(ctx.owner, ctx.origin, `ach.${category}.${page + 1}`), 'Next', NAV, { disabled: page >= pages - 1 }),
      );
    }
    return {
      embeds: [e],
      components: [
        select(ids.pick(ctx.owner, ctx.origin, 'ach'), 'Pick a category', CATEGORIES.map((c) => {
          const list = achievements.filter((a) => a.category === c);
          return { label: categoryLabel[c], value: c, description: `${list.filter((a) => unlockedAt(p, a.id)).length} / ${list.length} unlocked`, default: c === category };
        })),
        row(...nav),
      ],
    };
  },
};

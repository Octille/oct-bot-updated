import { icon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { bar, coins, num } from '../../lib/format';
import { fishdexRewards, fishSpecies } from '../../content/fishing';
import { rarities, rarityInfo, type Rarity } from '../../content/rarity';
import { back, btn, ids, NAV, row, select } from '../kit';
import type { ScreenModule } from './types';
import type { Profile } from '../../services/economy';

export function fishdexEmbed(profile: Profile, name: string, filter: Rarity | 'all', note?: string) {
  const dex = (profile.fishdex ?? {}) as Record<string, { caught: number; biggest: number }>;
  const found = fishSpecies.filter((f) => (dex[f.id]?.caught ?? 0) > 0).length;
  const claimed = profile.fishdexRewards ?? [];
  const next = fishdexRewards.find((r) => !claimed.includes(r.percent));
  const nextNeed = next ? Math.ceil((next.percent / 100) * fishSpecies.length) - found : 0;

  const e = embed('economy')
    .setTitle(`${icon('fishdex')} Fishdex${filter === 'all' ? '' : ` › ${rarityInfo[filter].label}`}`)
    .setDescription([
      note,
      `**${name}** — ${found}/${fishSpecies.length} species ${bar(found, fishSpecies.length, 12)}`,
      next ? `Next reward: **${coins(next.coins)}** at ${next.percent}% (${nextNeed} more species)` : `${icon('success')} Fishdex complete!`,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `${num(profile.stats?.fishCaught ?? 0)} fish caught in total` });

  for (const rarity of rarities) {
    if (filter !== 'all' && filter !== rarity) continue;
    const species = fishSpecies.filter((f) => f.rarity === rarity);
    const have = species.filter((f) => (dex[f.id]?.caught ?? 0) > 0).length;
    e.addFields({
      name: `${rarityInfo[rarity].label} ${have}/${species.length}`,
      value: species.map((f) => (dex[f.id]?.caught ? `**${f.name}** ×${num(dex[f.id]!.caught)} · best ${num(dex[f.id]!.biggest)} kg` : '???')).join('\n'),
      inline: filter === 'all',
    });
  }
  return e;
}

export const fishdex: ScreenModule = {
  render(path, ctx) {
    const filter = (rarities as readonly string[]).includes(path[1] ?? '') ? (path[1] as Rarity) : 'all';
    return {
      embeds: [fishdexEmbed(ctx.profile, ctx.userName, filter, ctx.note)],
      components: [
        select(ids.pick(ctx.owner, ctx.origin, 'dex'), 'Filter by rarity', [
          { label: 'All rarities', value: 'all', description: 'Every species', default: filter === 'all' },
          ...rarities.map((r) => ({ label: rarityInfo[r].label, value: r, emoji: icon(r), description: `${fishSpecies.filter((f) => f.rarity === r).length} species`, default: filter === r })),
        ]),
        row(back(ctx, null), btn(ids.go(ctx.owner, 'fish'), 'Go fishing', NAV)),
      ],
    };
  },
};

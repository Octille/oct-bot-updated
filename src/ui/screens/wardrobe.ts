import { icon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { themeColor, titled } from '../../lib/theme';
import { UserError } from '../../lib/errors';
import { cosmetics, getCosmetic } from '../../content/cosmetics';
import { apply } from '../../services/economy';
import { back, btn, ids, NAV, row, select, type Row } from '../kit';
import type { ScreenModule } from './types';

export const wardrobe: ScreenModule = {
  render(_path, ctx) {
    const p = ctx.profile;
    const owned = (p.cosmetics?.owned ?? []).map(getCosmetic).filter((c) => !!c);
    const titles = owned.filter((c) => c.kind === 'title');
    const themes = owned.filter((c) => c.kind === 'theme');
    const title = p.cosmetics?.title ? getCosmetic(p.cosmetics.title) : undefined;
    const theme = p.cosmetics?.theme ? getCosmetic(p.cosmetics.theme) : undefined;

    const e = embed('economy').setTitle(`${icon('wardrobe')} Wardrobe`)
      .setDescription([
        ctx.note,
        `Shows as: **${titled(ctx.userName, p)}**`,
        `Title: ${title?.name ?? 'none'} • Theme: ${theme?.name ?? 'none'}`,
        owned.length ? null : "You don't own any cosmetics yet — browse them in the shop.",
      ].filter(Boolean).join('\n'))
      .setFooter({ text: `${owned.length}/${cosmetics.length} collected • Titles show next to your name; themes colour your embeds.` });
    const color = themeColor(p);
    if (color !== null) e.setColor(color);

    const components: Row[] = [];
    if (titles.length) {
      components.push(select(ids.act(ctx.owner, ctx.origin, 'wardrobe', 'equip', 'title'), 'Equip a title', [
        { label: 'No title', value: 'none', description: 'Show just your name', default: !title },
        ...titles.slice(0, 9).map((c) => ({ label: c.name, value: c.id, description: `Shows as: ${ctx.userName} • ${c.value}`, default: c.id === title?.id })),
      ]));
    }
    if (themes.length) {
      components.push(select(ids.act(ctx.owner, ctx.origin, 'wardrobe', 'equip', 'theme'), 'Equip a theme', [
        { label: 'Default colours', value: 'none', description: 'Each menu uses its own colour', default: !theme },
        ...themes.slice(0, 9).map((c) => ({ label: c.name, value: c.id, description: `Colours your menus #${(c.value as number).toString(16).padStart(6, '0')}`, default: c.id === theme?.id })),
      ]));
    }
    components.push(row(back(ctx, null), btn(ids.nav(ctx.owner, ctx.origin, 'shop.cos'), 'Browse cosmetics', NAV)));
    return { embeds: [e], components };
  },

  async act(_path, action, args, interaction, ctx) {
    if (action !== 'equip' || !interaction.isStringSelectMenu()) return { path: 'wardrobe' };
    const kind = args[0] as 'title' | 'theme';
    const value = interaction.values[0]!;
    if (value !== 'none' && !(ctx.profile.cosmetics?.owned ?? []).includes(value)) throw new UserError("You don't own that.");
    await apply(ctx.owner, { set: { [`cosmetics.${kind}`]: value === 'none' ? null : value } }, { source: 'cosmetics.equip' });
    return { path: 'wardrobe', note: value === 'none' ? `Removed your ${kind}.` : `${icon('success')} Equipped **${getCosmetic(value)?.name}**.` };
  },
};

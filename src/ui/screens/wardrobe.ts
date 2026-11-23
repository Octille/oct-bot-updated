import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { badgeIcon, themeColor, titled } from '../../lib/theme';
import { UserError } from '../../lib/errors';
import { cosmetics, getCosmetic } from '../../content/cosmetics';
import { apply } from '../../services/economy';
import { back, btn, ids, NAV, row, select, type Row } from '../kit';
import type { ScreenModule } from './types';
import type { IconKey } from '../../content/icons';

export const wardrobe: ScreenModule = {
  render(_path, ctx) {
    const p = ctx.profile;
    const owned = (p.cosmetics?.owned ?? []).map(getCosmetic).filter((c) => !!c);
    const titles = owned.filter((c) => c.kind === 'title');
    const themes = owned.filter((c) => c.kind === 'theme');
    const badges = owned.filter((c) => c.kind === 'badge');
    const title = p.cosmetics?.title ? getCosmetic(p.cosmetics.title) : undefined;
    const theme = p.cosmetics?.theme ? getCosmetic(p.cosmetics.theme) : undefined;
    const badge = p.cosmetics?.badge ? getCosmetic(p.cosmetics.badge) : undefined;
    // Exclusives only count toward the total once you own one
    const collectable = cosmetics.filter((c) => !c.exclusive || owned.includes(c)).length;

    const e = embed('economy').setTitle(`${titleIcon('wardrobe')} Wardrobe`)
      .setDescription([
        ctx.note,
        `Shows as: **${titled(ctx.userName, p)}**`,
        `Title: ${title?.name ?? 'none'} • Theme: ${theme?.name ?? 'none'}${badges.length ? ` • Badge: ${badge ? `${badgeIcon(p)} ${badge.name}` : 'hidden'}` : ''}`,
        owned.length ? null : "You don't own any cosmetics yet — browse them in the shop.",
      ].filter(Boolean).join('\n'))
      .setFooter({ text: `${owned.length}/${collectable} collected • Titles show next to your name; themes colour your embeds.` });
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
        { label: 'Default colours', value: 'none', description: 'OctBot blue', default: !theme },
        ...themes.slice(0, 9).map((c) => ({ label: c.name, value: c.id, description: `Colours your menus #${(c.value as number).toString(16).padStart(6, '0')}`, default: c.id === theme?.id })),
      ]));
    }
    if (badges.length) {
      components.push(select(ids.act(ctx.owner, ctx.origin, 'wardrobe', 'equip', 'badge'), 'Show a badge', [
        { label: 'Hide badge', value: 'none', description: 'Show just your name', default: !badge },
        ...badges.map((c) => ({ label: c.name, value: c.id, emoji: icon(c.value as IconKey), description: 'Shown before your name', default: c.id === badge?.id })),
      ]));
    }
    components.push(row(back(ctx, null), btn(ids.nav(ctx.owner, ctx.origin, 'shop.cos'), 'Browse cosmetics', NAV)));
    return { embeds: [e], components };
  },

  async act(_path, action, args, interaction, ctx) {
    if (action !== 'equip' || !interaction.isStringSelectMenu()) return { path: 'wardrobe' };
    const kind = args[0];
    if (kind !== 'title' && kind !== 'theme' && kind !== 'badge') return { path: 'wardrobe' };
    const value = interaction.values[0]!;
    if (value !== 'none' && !(ctx.profile.cosmetics?.owned ?? []).includes(value)) throw new UserError("You don't own that.");
    if (value !== 'none' && getCosmetic(value)?.kind !== kind) throw new UserError("That doesn't go there.");
    await apply(ctx.owner, { set: { [`cosmetics.${kind}`]: value === 'none' ? null : value } }, { source: 'cosmetics.equip' });
    return { path: 'wardrobe', note: value === 'none' ? (kind === 'badge' ? 'Badge hidden.' : `Removed your ${kind}.`) : `${icon('success')} Equipped **${getCosmetic(value)?.name}**.` };
  },
};

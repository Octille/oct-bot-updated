import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { badgeIcon, themeColor, titled } from '../../lib/theme';
import { UserError } from '../../lib/errors';
import { cosmetics, getCosmetic, type Cosmetic, type CosmeticKind } from '../../content/cosmetics';
import type { IconKey } from '../../content/icons';
import { apply } from '../../services/economy';
import { back, btn, ids, NAV, row, select, type Option, type Payload, type Row, type ScreenCtx } from '../kit';
import type { ScreenModule } from './types';

const SLOTS: { kind: CosmeticKind; label: string; none: string; what: string }[] = [
  { kind: 'title', label: 'Title', none: 'No title', what: 'Shown next to your name' },
  { kind: 'badge', label: 'Badge', none: 'Hide badge', what: 'Shown before your name' },
  { kind: 'theme', label: 'Theme', none: 'Default colours', what: 'Colours your Balance and Wardrobe' },
  { kind: 'background', label: 'Card background', none: 'Default background', what: 'Background of /rank and /profile' },
  { kind: 'frame', label: 'Avatar frame', none: 'No frame', what: 'Ring around your avatar on cards' },
];

function equipped(ctx: ScreenCtx, kind: CosmeticKind): Cosmetic | undefined {
  const id = ctx.profile.cosmetics?.[kind];
  return id ? getCosmetic(id) : undefined;
}

function owned(ctx: ScreenCtx, kind: CosmeticKind): Cosmetic[] {
  return (ctx.profile.cosmetics?.owned ?? []).map(getCosmetic).filter((c): c is Cosmetic => c?.kind === kind);
}

function describe(c: Cosmetic): string {
  switch (c.kind) {
    case 'title': return `Shows as: … • ${c.value}`;
    case 'theme': return `Colour #${(c.value as number).toString(16).padStart(6, '0')}`;
    case 'badge': return 'Shown before your name';
    case 'background': return 'Card background';
    case 'frame': return 'Avatar ring on cards';
  }
}

function overview(ctx: ScreenCtx): Payload {
  const p = ctx.profile;
  const all = (p.cosmetics?.owned ?? []).map(getCosmetic).filter((c): c is Cosmetic => !!c);
  // Exclusives only count toward the total once you own one
  const collectable = cosmetics.filter((c) => !c.exclusive || all.includes(c)).length;
  const slots = SLOTS.filter((s) => owned(ctx, s.kind).length);
  const e = embed('economy').setTitle(`${titleIcon('wardrobe')} Wardrobe`)
    .setDescription([
      ctx.note,
      `Shows as: **${titled(ctx.userName, p)}**`,
      '',
      ...SLOTS.map((s) => {
        const c = equipped(ctx, s.kind);
        const shown = c ? (s.kind === 'badge' ? `${badgeIcon(p)} ${c.name}` : c.name) : 'none';
        return `**${s.label}:** ${shown}`;
      }),
      all.length ? null : "\nYou don't own any cosmetics yet. Browse them in the shop.",
    ].filter((l) => l !== null && l !== undefined).join('\n'))
    .setFooter({ text: `${all.length}/${collectable} collected · Pick a slot to change it.` });
  const color = themeColor(p);
  if (color !== null) e.setColor(color);

  const components: Row[] = [];
  if (slots.length) {
    components.push(select(ids.pick(ctx.owner, ctx.origin, 'wardrobe'), 'Change a slot', slots.map((s) => ({
      label: s.label, value: s.kind, description: `${owned(ctx, s.kind).length} owned · ${s.what}`,
    }))));
  }
  components.push(row(back(ctx, null), btn(ids.nav(ctx.owner, ctx.origin, 'shop.cos'), 'Browse cosmetics', NAV)));
  return { embeds: [e], components };
}

const PER_PAGE = 9;

function slotScreen(ctx: ScreenCtx, kind: CosmeticKind, pageArg: string | undefined): Payload {
  const slot = SLOTS.find((s) => s.kind === kind)!;
  const list = owned(ctx, kind);
  const current = equipped(ctx, kind);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const page = Math.min(pages - 1, Math.max(0, Number(pageArg) || 0));
  const e = embed('economy').setTitle(`${titleIcon('wardrobe')} Wardrobe › ${slot.label}`)
    .setDescription([ctx.note, `${slot.what}.`, `Equipped: **${current?.name ?? 'none'}**`].filter(Boolean).join('\n'));
  if (pages > 1) e.setFooter({ text: `Page ${page + 1} of ${pages} · ${list.length} owned` });
  const color = themeColor(ctx.profile);
  if (color !== null) e.setColor(color);
  const options: Option[] = [
    { label: slot.none, value: 'none', default: !current },
    ...list.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((c) => ({
      label: c.name, value: c.id, description: describe(c), default: c.id === current?.id,
      ...(c.kind === 'badge' ? { emoji: icon(c.value as IconKey) } : {}),
    })),
  ];
  return {
    embeds: [e],
    components: [
      select(ids.act(ctx.owner, ctx.origin, `wardrobe.${kind}`, 'equip', kind), `Pick a ${slot.label.toLowerCase()}`, options),
      row(
        back(ctx, 'wardrobe'),
        ...(pages > 1 ? [
          btn(ids.nav(ctx.owner, ctx.origin, `wardrobe.${kind}.${page - 1}`), 'Prev', NAV, { disabled: page === 0 }),
          btn(ids.nav(ctx.owner, ctx.origin, `wardrobe.${kind}.${page + 1}`), 'Next', NAV, { disabled: page >= pages - 1 }),
        ] : []),
      ),
    ],
  };
}

/** wardrobe · wardrobe.<slot> */
export const wardrobe: ScreenModule = {
  render(path, ctx) {
    const kind = path[1] as CosmeticKind | undefined;
    if (kind && SLOTS.some((s) => s.kind === kind)) return slotScreen(ctx, kind, path[2]);
    return overview(ctx);
  },

  async act(_path, action, args, interaction, ctx) {
    const kind = args[0] as CosmeticKind;
    if (action !== 'equip' || !interaction.isStringSelectMenu() || !SLOTS.some((s) => s.kind === kind)) return { path: 'wardrobe' };
    const value = interaction.values[0]!;
    if (value !== 'none' && !(ctx.profile.cosmetics?.owned ?? []).includes(value)) throw new UserError("You don't own that.");
    if (value !== 'none' && getCosmetic(value)?.kind !== kind) throw new UserError("That doesn't go there.");
    await apply(ctx.owner, { set: { [`cosmetics.${kind}`]: value === 'none' ? null : value } }, { source: 'cosmetics.equip' });
    const slot = SLOTS.find((s) => s.kind === kind)!;
    return { path: `wardrobe.${kind}`, note: value === 'none' ? `${slot.label} removed.` : `${icon('success')} Equipped **${getCosmetic(value)?.name}**.` };
  },
};

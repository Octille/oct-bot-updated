import { icon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { getItem, itemLabel, itemName, type ItemType } from '../../content/items';
import { consumableUses } from '../../content/consumables';
import { rarities, rarityInfo, type Rarity } from '../../content/rarity';
import {
  bulkTypes, inventoryOf, inventoryValue, isRareItem, RARE_FROM, saleTotal, selectForSale, sell, setLocked, useItem,
  type BulkFilter, type Inventory,
} from '../../services/items';
import { back, btn, ids, MAIN, MAX_OPTIONS, NAV, row, select, type Row, type ScreenCtx } from '../kit';
import { describeUse } from './useResult';
import type { ScreenModule } from './types';

/** Category filters. Codes appear in paths, e.g. `inv.fish.0`. Bulk sales also accept `r-<rarity>`. */
const FILTERS: { code: string; label: string; type?: ItemType }[] = [
  { code: 'all', label: 'Everything' },
  { code: 'fish', label: 'Fish', type: 'fish' },
  { code: 'material', label: 'Materials & trophies', type: 'material' },
  { code: 'collectible', label: 'Collectibles & treasure', type: 'collectible' },
  { code: 'consumable', label: 'Consumables', type: 'consumable' },
  { code: 'crate', label: 'Crates', type: 'crate' },
];

function filterOf(code: string) {
  return FILTERS.find((f) => f.code === code) ?? FILTERS[0]!;
}

function bulkFilter(code: string): BulkFilter | null {
  if (code === 'all') return { everything: true };
  if (code.startsWith('r-')) return rarities.includes(code.slice(2) as Rarity) ? { rarity: code.slice(2) as Rarity } : null;
  const f = FILTERS.find((x) => x.code === code);
  return f?.type && bulkTypes.includes(f.type) ? { type: f.type } : null;
}

function bulkName(code: string): string {
  if (code === 'all') return 'everything';
  if (code.startsWith('r-')) return `all ${rarityInfo[code.slice(2) as Rarity]?.label ?? ''} items`;
  return `all ${filterOf(code).label.toLowerCase()}`;
}

function entries(ctx: ScreenCtx, code: string) {
  const f = filterOf(code);
  return Object.entries(inventoryOf(ctx.profile))
    .map(([id, qty]) => ({ id, qty, item: getItem(id) }))
    .filter((e) => e.qty > 0 && e.item && (!f.type || e.item.type === f.type))
    .sort((a, b) => rarities.indexOf(b.item!.rarity) - rarities.indexOf(a.item!.rarity) || a.item!.name.localeCompare(b.item!.name));
}

const locked = (ctx: ScreenCtx) => new Set(ctx.profile.lockedItems ?? []);

function list(ctx: ScreenCtx, code: string, pageArg: number) {
  const f = filterOf(code);
  const all = entries(ctx, code);
  const pages = Math.max(1, Math.ceil(all.length / MAX_OPTIONS));
  const page = Math.min(Math.max(0, pageArg), pages - 1);
  const slice = all.slice(page * MAX_OPTIONS, (page + 1) * MAX_OPTIONS);
  const lock = locked(ctx);
  const e = embed('economy')
    .setTitle(`${icon('inventory')} Inventory › ${f.label}`)
    .setDescription([
      ctx.note,
      slice.length
        ? slice.map(({ id, qty, item }) => `${icon(item!.rarity)} **${item!.name}** ×${num(qty)} · ${coins(item!.sellPrice * qty)}${lock.has(id) ? ` ${icon('locked')}` : ''}`).join('\n')
        : 'Nothing here yet. Go `/fish`, `/mine`, `/hunt` or `/dig`!',
    ].filter(Boolean).join('\n\n'))
    .setFooter({ text: `Page ${page + 1}/${pages} · total value ${coins(inventoryValue(inventoryOf(ctx.profile)))} · Tip: pick an item to use, sell or lock it.` });

  const components: Row[] = [
    select(ids.pick(ctx.owner, ctx.origin, 'inv'), 'Category', FILTERS.map((x) => ({ label: x.label, value: `${x.code}.0`, default: x.code === f.code }))),
  ];
  if (slice.length) {
    components.push(select(ids.pick(ctx.owner, ctx.origin, 'inv.item'), 'Pick an item', slice.map(({ id, qty, item }) => ({
      label: item!.name,
      value: `${id}.${f.code}.${page}`,
      emoji: icon(item!.rarity),
      description: `×${num(qty)} · ${coins(item!.sellPrice)} each${lock.has(id) ? ' · locked' : ''}`,
    }))));
  }
  const buttons = [
    back(ctx, null),
    btn(ids.nav(ctx.owner, ctx.origin, `inv.${f.code}.${page - 1}`), 'Prev', NAV, { disabled: page === 0 }),
    btn(ids.nav(ctx.owner, ctx.origin, `inv.${f.code}.${page + 1}`), 'Next', NAV, { disabled: page >= pages - 1 }),
  ];
  if (bulkFilter(f.code)) {
    const sel = selectForSale(inventoryOf(ctx.profile), bulkFilter(f.code)!, { locked: ctx.profile.lockedItems ?? [] });
    const total = saleTotal(sel.items);
    buttons.push(btn(ids.nav(ctx.owner, ctx.origin, `inv.sell.${f.code}.0.${f.code}`), total ? `Sell all · ${coins(total)}` : 'Nothing to sell', MAIN, { disabled: total === 0 && !Object.keys(sel.skippedRare).length }));
  }
  components.push(row(...buttons));
  return { embeds: [e], components };
}

function itemScreen(ctx: ScreenCtx, id: string, code: string, page: string) {
  const item = getItem(id);
  const qty = inventoryOf(ctx.profile)[id] ?? 0;
  const isLocked = locked(ctx).has(id);
  const parent = `inv.${code}.${page}`;
  const path = `inv.item.${id}.${code}.${page}`;
  if (!item) return { embeds: [embed('economy').setDescription("I don't know that item.")], components: [row(back(ctx, parent))] };
  const info = rarityInfo[item.rarity];
  const usable = !!consumableUses[id] && id !== 'streak_freeze';

  const e = embed('economy').setColor(info.color)
    .setTitle(`${icon('inventory')} Inventory › ${item.name}`)
    .setDescription([
      ctx.note,
      ctx.note ? '' : null,
      item.description,
      '',
      `${icon(item.rarity)} ${info.label} · ${item.type}`,
      `You own **${num(qty)}** · sells for ${coins(item.sellPrice)} each (${coins(item.sellPrice * qty)} total)`,
      isLocked ? `${icon('locked')} **Locked.** Bulk sales skip it.` : null,
      id === 'streak_freeze' ? 'Used automatically when you miss a day of /daily.' : null,
    ].filter((l) => l !== null && l !== undefined).join('\n'));

  const buttons = [back(ctx, parent)];
  if (qty > 0) {
    if (usable) buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'use', id), item.type === 'crate' ? `Open 1 (${num(qty)} left)` : 'Use 1', MAIN, {}));
    if (item.sellPrice > 0) {
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'sell1', id), `Sell 1 · ${coins(item.sellPrice)}`, usable ? NAV : MAIN));
      if (qty > 1) buttons.push(btn(ids.nav(ctx.owner, ctx.origin, `inv.sellitem.${id}.${code}.${page}`), `Sell all ${num(qty)}`, NAV));
    }
    buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, isLocked ? 'unlock' : 'lock', id), isLocked ? 'Unlock' : 'Lock', NAV));
  }
  return { embeds: [e], components: [row(...buttons)] };
}

function describeStacks(items: Inventory, limit = 12): string {
  const lines = Object.entries(items).slice(0, limit).map(([id, q]) => `${icon(getItem(id)?.rarity ?? 'common')} ${itemName(id, q)} · ${coins((getItem(id)?.sellPrice ?? 0) * q)}`);
  const more = Object.keys(items).length - limit;
  if (more > 0) lines.push(`…and ${more} more`);
  return lines.join('\n');
}

function bulkConfirm(ctx: ScreenCtx, code: string, includeRare: boolean, returnTo: string) {
  const filter = bulkFilter(code);
  const parent = `inv.${returnTo}.0`;
  if (!filter) return { embeds: [embed('economy').setDescription('That category can\'t be bulk-sold.')], components: [row(back(ctx, parent))] };
  const sel = selectForSale(inventoryOf(ctx.profile), filter, { includeRare, locked: ctx.profile.lockedItems ?? [] });
  const total = saleTotal(sel.items);
  const count = Object.values(sel.items).reduce((a, b) => a + b, 0);
  const path = `inv.sell.${code}.${includeRare ? 1 : 0}.${returnTo}`;
  const rareCount = Object.keys(sel.skippedRare).length;
  const lockedCount = Object.keys(sel.skippedLocked).length;

  const e = embed('economy').setTitle(`${icon('inventory')} Inventory › Sell ${bulkName(code)}`)
    .setDescription([
      ctx.note,
      count ? `You'll sell **${num(count)} item${count === 1 ? '' : 's'}** for ${icon('currency')} **${coins(total)}** → wallet after ${coins(ctx.profile.wallet + total)}` : 'Nothing to sell with these settings.',
      count ? describeStacks(sel.items) : null,
      rareCount ? `Keeping ${rareCount} ${rarityInfo[RARE_FROM].label}+ stack${rareCount === 1 ? '' : 's'} (${coins(saleTotal(sel.skippedRare))}). Use **Include rare** to sell them too.` : null,
      includeRare && !rareCount && Object.keys(sel.items).some(isRareItem) ? `Includes ${rarityInfo[RARE_FROM].label}+ items.` : null,
      lockedCount ? `${icon('locked')} Skipping ${lockedCount} locked item${lockedCount === 1 ? '' : 's'}.` : null,
    ].filter(Boolean).join('\n\n'))
    .setFooter({ text: 'Tip: lock items from their item screen to keep them out of bulk sales.' });

  return {
    embeds: [e],
    components: [row(
      back(ctx, parent),
      btn(ids.nav(ctx.owner, ctx.origin, `inv.sell.${code}.${includeRare ? 0 : 1}.${returnTo}`), includeRare ? 'Exclude rare' : 'Include rare', NAV),
      btn(ids.act(ctx.owner, ctx.origin, path, 'sellbulk', total), count ? `Sell ${num(count)} · ${coins(total)}` : 'Nothing to sell', MAIN, { disabled: !count }),
    )],
  };
}

function itemSellConfirm(ctx: ScreenCtx, id: string, code: string, page: string) {
  const item = getItem(id);
  const qty = inventoryOf(ctx.profile)[id] ?? 0;
  const parent = `inv.item.${id}.${code}.${page}`;
  const total = (item?.sellPrice ?? 0) * qty;
  const e = embed('economy').setTitle(`${icon('inventory')} Inventory › Sell all ${item?.name ?? id}`)
    .setDescription([
      ctx.note,
      qty ? `Sell **${itemName(id, qty)}** for ${icon('currency')} **${coins(total)}** → wallet after ${coins(ctx.profile.wallet + total)}` : "You don't have any left.",
      locked(ctx).has(id) ? `${icon('locked')} This item is locked. Selling it here still works; locks only protect it from bulk sales.` : null,
      item && isRareItem(id) ? `This is a ${rarityInfo[item.rarity].label} item.` : null,
    ].filter(Boolean).join('\n\n'));
  return {
    embeds: [e],
    components: [row(
      back(ctx, parent),
      btn(ids.act(ctx.owner, ctx.origin, `inv.sellitem.${id}.${code}.${page}`, 'sellall', id, qty), `Sell all ${num(qty)} · ${coins(total)}`, MAIN, { disabled: !qty }),
    )],
  };
}

export const inventory: ScreenModule = {
  render(path, ctx) {
    const [, a, b, c, d] = path;
    if (a === 'item' && b) return itemScreen(ctx, b, c ?? 'all', d ?? '0');
    if (a === 'sell' && b) return bulkConfirm(ctx, b, c === '1', d ?? (bulkFilter(b) && !b.startsWith('r-') ? b : 'all'));
    if (a === 'sellitem' && b) return itemSellConfirm(ctx, b, c ?? 'all', d ?? '0');
    return list(ctx, a ?? 'all', Number(b ?? 0) || 0);
  },

  async act(path, action, args, interaction, ctx) {
    const here = path.join('.');
    try {
      switch (action) {
        case 'use': {
          const id = args[0]!;
          const item = getItem(id);
          if (item?.type === 'crate' && interaction.isButton()) {
            // A short spinning reveal on the same message
            await interaction.deferUpdate();
            const spin = ['⚪', '🟢', '🔵', '🟣', '🟠', '🔴'];
            for (let step = 0; step < 3; step++) {
              const reel = Array.from({ length: 5 }, (_, k) => spin[(step * 2 + k) % spin.length]).join(' ');
              await interaction.editReply({ embeds: [embed('economy').setColor(rarityInfo[item.rarity].color).setTitle(`${item.emoji} Opening ${item.name}...`).setDescription(`# ${reel}`)], components: [] });
              await new Promise((r) => setTimeout(r, 600));
            }
          }
          return { path: here, note: describeUse(await useItem(ctx.owner, id, 1)) };
        }
        case 'sell1': {
          const sale = await sell(ctx.owner, { [args[0]!]: 1 });
          return { path: here, note: `${icon('success')} Sold ${itemName(args[0]!, 1)} for ${coins(sale.total)}. Wallet ${coins(sale.profile.wallet)}` };
        }
        case 'sellall': {
          const [id, expected] = args;
          const qty = inventoryOf(ctx.profile)[id!] ?? 0;
          if (qty !== Number(expected)) return { path: here, note: `${icon('warning')} Your inventory changed. Check the new amount.` };
          const sale = await sell(ctx.owner, { [id!]: qty });
          const [, , , code, page] = path;
          return { path: `inv.${code ?? 'all'}.${page ?? 0}`, note: `${icon('success')} Sold ${itemName(id!, qty)} for ${coins(sale.total)}. Wallet ${coins(sale.profile.wallet)}` };
        }
        case 'sellbulk': {
          const [, , code, rare, returnTo] = path;
          const sel = selectForSale(inventoryOf(ctx.profile), bulkFilter(code!)!, { includeRare: rare === '1', locked: ctx.profile.lockedItems ?? [] });
          const total = saleTotal(sel.items);
          if (total !== Number(args[0])) return { path: here, note: `${icon('warning')} Your inventory changed. Check the new total before selling.` };
          const sale = await sell(ctx.owner, sel.items);
          return { path: `inv.${returnTo ?? 'all'}.0`, note: `${icon('success')} Sold ${bulkName(code!)} for **${coins(sale.total)}**. Wallet ${coins(sale.profile.wallet)}` };
        }
        case 'lock':
        case 'unlock':
          await setLocked(ctx.owner, args[0]!, action === 'lock');
          return { path: here, note: action === 'lock' ? `${icon('success')} Locked. Bulk sales will skip it.` : `${icon('success')} Unlocked.` };
      }
    } catch (err) {
      if (err instanceof UserError) return { path: here, note: `${icon('error')} ${err.message}` };
      throw err;
    }
    return { path: here };
  },
};

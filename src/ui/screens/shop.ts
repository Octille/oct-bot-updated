import { embed } from '../../lib/embeds';
import { bar, coins } from '../../lib/format';
import { icon, rarityTag, titleIcon } from '../../lib/icons';
import { UserError } from '../../lib/errors';
import { nextTool, repairCost, type Tool, type ToolSlot } from '../../content/tools';
import { basics } from '../../content/shop';
import { getCosmetic, shopCosmetics } from '../../content/cosmetics';
import { consumableUses } from '../../content/consumables';
import { getItem } from '../../content/items';
import { boughtToday, buy, displayName, getRotation } from '../../services/shop';
import { equipped, repair, upgrade } from '../../services/tools';
import { inventoryOf, useItem } from '../../services/items';
import { apply } from '../../services/economy';
import { back, btn, ids, MAIN, NAV, row, select, type Row, type ScreenCtx } from '../kit';
import { describeUse } from './useResult';
import type { ScreenModule } from './types';

const SECTIONS = [
  { id: 'tools', label: 'Tools', description: 'Pickaxe, rod, weapon and shovel: buy or repair' },
  { id: 'cons', label: 'Consumables', description: 'Boosts, bank notes, streak freezes, scratch cards' },
  { id: 'crates', label: 'Crates', description: "Loot crates, including today's rare ones" },
  { id: 'deals', label: "Today's deals", description: 'Changes at 00:00 UTC, per-player daily limits' },
  { id: 'cos', label: 'Cosmetics', description: 'Titles and colour themes' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const TOOL_SLOTS: { slot: ToolSlot; label: string; activity: string; activityLabel: string }[] = [
  { slot: 'pickaxe', label: 'Pickaxe', activity: 'mine', activityLabel: 'Go mining' },
  { slot: 'rod', label: 'Rod', activity: 'fish', activityLabel: 'Go fishing' },
  { slot: 'weapon', label: 'Weapon', activity: 'hunt', activityLabel: 'Go hunting' },
  { slot: 'shovel', label: 'Shovel', activity: 'dig', activityLabel: 'Go digging' },
];

interface Listing {
  id: string;
  kind: 'item' | 'cosmetic';
  price: number;
  /** Daily per-player limit for rotation items. */
  limit?: number;
}

function sectionListings(section: SectionId): Listing[] {
  const { stock } = getRotation();
  switch (section) {
    case 'cons': return basics.filter((b) => getItem(b.id)?.type === 'consumable');
    case 'crates': return [
      ...basics.filter((b) => getItem(b.id)?.type === 'crate'),
      ...stock.filter((s) => getItem(s.id)?.type === 'crate'),
    ];
    case 'deals': return stock;
    case 'cos': return shopCosmetics().map((c) => ({ id: c.id, kind: 'cosmetic' as const, price: c.price }));
    default: return [];
  }
}

function findListing(id: string): Listing | undefined {
  for (const s of ['cons', 'crates', 'deals', 'cos'] as const) {
    const found = sectionListings(s).find((l) => l.id === id);
    if (found) return found;
  }
  return undefined;
}

function needMore(wallet: number, cost: number): string | null {
  return wallet >= cost ? null : `Need ${coins(cost - wallet)} more`;
}

/** "Costs ₪X → wallet after ₪Y", without a negative wallet when it isn't affordable. */
function priceLine(label: string, cost: number, wallet: number): string {
  return wallet >= cost ? `${label} **${coins(cost)}** → wallet after ${coins(wallet - cost)}` : `${label} **${coins(cost)}**`;
}

function title(...parts: string[]): string {
  return [`${titleIcon('shop')} Shop`, ...parts].join(' › ');
}

function root(ctx: ScreenCtx) {
  const e = embed('economy').setTitle(title())
    .setDescription([ctx.note, `Wallet ${coins(ctx.profile.wallet)}`, '', ...SECTIONS.map((s) => `**${s.label}** — ${s.description}`)].filter((l) => l !== undefined).join('\n'))
    .setFooter({ text: 'Tip: pick a section, then an item.' });
  return {
    embeds: [e],
    components: [
      select(ids.pick(ctx.owner, ctx.origin, 'shop'), 'Pick a section', SECTIONS.map((s) => ({ label: s.label, value: s.id, description: s.description }))),
      row(back(ctx, null)),
    ],
  };
}

function toolLine(tool: Tool | null, durability: number, broken: boolean): string {
  return tool ? `${tool.name} · ${durability}/${tool.durability}${broken ? ' (broken)' : ''}` : 'none';
}

function toolsList(ctx: ScreenCtx) {
  const p = ctx.profile;
  const e = embed('economy').setTitle(title('Tools')).setDescription([ctx.note, `Wallet ${coins(p.wallet)}`].filter(Boolean).join('\n'))
    .setFooter({ text: 'Tip: pick a tool to upgrade or repair it.' });
  const options = TOOL_SLOTS.map(({ slot, label }) => {
    const eq = equipped(p, slot);
    const next = nextTool(slot, eq.tool?.id);
    const now = toolLine(eq.tool, eq.durability, eq.broken);
    e.addFields({ name: label, value: `${now}${next ? `\nNext: ${next.name} · ${coins(next.cost)}` : '\nBest in the game'}`, inline: true });
    return { label, value: slot, description: eq.tool ? now : `Not owned${next ? ` · ${next.name} ${coins(next.cost)}` : ''}` };
  });
  return {
    embeds: [e],
    components: [select(ids.pick(ctx.owner, ctx.origin, 'shop.tools'), 'Pick a tool', options), row(back(ctx, 'shop'))],
  };
}

function toolScreen(ctx: ScreenCtx, slot: ToolSlot) {
  const p = ctx.profile;
  const meta = TOOL_SLOTS.find((t) => t.slot === slot)!;
  const eq = equipped(p, slot);
  const next = nextTool(slot, eq.tool?.id);
  const level = p.account?.level ?? 0;
  const path = `shop.tools.${slot}`;

  const lines: string[] = [];
  if (ctx.note) lines.push(ctx.note, '');
  lines.push(eq.tool ? `**Now:** ${toolLine(eq.tool, eq.durability, eq.broken)} ${bar(eq.durability, eq.tool.durability, 10)}` : '**Now:** none');
  const fixCost = eq.tool && eq.durability < eq.tool.durability ? repairCost(eq.tool, eq.durability) : 0;
  if (fixCost) lines.push(priceLine('Repair to full:', fixCost, p.wallet));
  if (next) {
    const stat = slot === 'pickaxe' ? `${next.mult}× haul`
      : slot === 'shovel' ? `${next.digs} digs, luck +${next.luck}, ${next.valueMult}× value`
      : `luck +${next.luck}, ${next.valueMult}× value, +${(next.windowBonusMs ?? 0) / 1000}s reaction time`;
    lines.push('', `**Next:** ${next.name} — ${stat}`, priceLine('Costs', next.cost, p.wallet));
    if (next.level > level) lines.push(`${icon('locked')} Needs level ${next.level} (you're ${level}).`);
  } else lines.push('', 'You have the best one.');

  const buttons = [back(ctx, 'shop.tools')];
  if (fixCost) {
    const short = needMore(p.wallet, fixCost);
    buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'fix', slot), short ?? `Repair · ${coins(fixCost)}`, eq.broken ? MAIN : NAV, { disabled: !!short }));
  }
  if (next) {
    const reason = next.level > level ? `Needs level ${next.level}` : needMore(p.wallet, next.cost);
    buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'up', slot), reason ?? `Buy ${next.name} · ${coins(next.cost)}`, MAIN, { disabled: !!reason }));
  }
  if (eq.tool && !eq.broken) buttons.push(btn(ids.go(ctx.owner, meta.activity), meta.activityLabel, NAV));

  return {
    embeds: [embed('economy').setTitle(title('Tools', meta.label)).setDescription(lines.join('\n')).setFooter({ text: `Wallet ${coins(p.wallet)}` })],
    components: [row(...buttons)],
  };
}

function sectionScreen(ctx: ScreenCtx, section: SectionId) {
  const meta = SECTIONS.find((s) => s.id === section)!;
  const p = ctx.profile;
  const listings = sectionListings(section);
  const { day } = getRotation();
  const owned = new Set(p.cosmetics?.owned ?? []);
  const lines = listings.map((l) => {
    const item = l.kind === 'item' ? getItem(l.id) : undefined;
    const marker = item ? `${icon(item.rarity)} ` : '';
    const status = l.kind === 'cosmetic' && owned.has(l.id) ? ' · owned'
      : l.limit ? ` · ${boughtToday(p, l.id, day)}/${l.limit} today` : '';
    return `${marker}${displayName(l)} · ${coins(l.price)}${status}`;
  });
  const e = embed('economy').setTitle(title(meta.label))
    .setDescription([ctx.note, `Wallet ${coins(p.wallet)}`, '', ...lines].filter((l) => l !== undefined).join('\n'))
    .setFooter({ text: section === 'deals' ? 'Changes at 00:00 UTC. Limits are per player.' : 'Tip: pick an item to see details and buy.' });
  const components: Row[] = [];
  if (listings.length) {
    components.push(select(ids.pick(ctx.owner, ctx.origin, 'shop.item'), 'Pick an item', listings.map((l) => {
      const item = l.kind === 'item' ? getItem(l.id) : undefined;
      return {
        label: displayName(l),
        value: `${l.id}.${section}`,
        emoji: item ? icon(item.rarity) : undefined,
        description: `${coins(l.price)}${l.limit ? ` · limit ${l.limit} a day` : ''}`,
      };
    })));
  }
  components.push(row(back(ctx, 'shop')));
  return { embeds: [e], components };
}

function itemScreen(ctx: ScreenCtx, id: string, section: SectionId) {
  const p = ctx.profile;
  const listing = findListing(id);
  const path = `shop.item.${id}.${section}`;
  const sectionLabel = SECTIONS.find((s) => s.id === section)!.label;
  if (!listing) {
    return { embeds: [embed('economy').setTitle(title(sectionLabel)).setDescription([ctx.note, "That's no longer for sale."].filter(Boolean).join('\n'))], components: [row(back(ctx, `shop.${section}`))] };
  }
  const { day } = getRotation();
  const cosmetic = listing.kind === 'cosmetic' ? getCosmetic(id) : undefined;
  const item = listing.kind === 'item' ? getItem(id) : undefined;
  const ownedQty = item ? inventoryOf(p)[id] ?? 0 : 0;
  const ownsCosmetic = !!cosmetic && (p.cosmetics?.owned ?? []).includes(id);
  const bought = listing.limit ? boughtToday(p, id, day) : 0;
  const left = listing.limit ? listing.limit - bought : Infinity;

  const lines = [
    ctx.note,
    ctx.note ? '' : null,
    item ? `${rarityTag(item.rarity)} · ${item.type}` : cosmetic?.kind === 'title' ? `Title · shows as "${ctx.userName} • ${cosmetic.value}"` : cosmetic?.kind === 'badge' ? 'Badge shown next to your name' : 'Colour theme for your menus',
    item?.description ?? null,
    '',
    ownsCosmetic ? 'You own this.' : priceLine('Price', listing.price, p.wallet),
    item ? `You own ${ownedQty}` : null,
    listing.limit ? `Today: ${bought}/${listing.limit} bought (resets 00:00 UTC)` : null,
  ].filter((l) => l !== null && l !== undefined);

  const buttons = [back(ctx, `shop.${section}`)];
  if (cosmetic) {
    if (ownsCosmetic) buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'equip', id), 'Equip it', MAIN));
    else {
      const reason = left <= 0 ? 'Daily limit reached' : needMore(p.wallet, listing.price);
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'buy', id, 1), reason ?? `Buy · ${coins(listing.price)}`, MAIN, { disabled: !!reason }));
    }
  } else {
    for (const qty of listing.limit ? [1] : [1, 5]) {
      const cost = listing.price * qty;
      const reason = left < qty ? 'Daily limit reached' : needMore(p.wallet, cost);
      if (qty > 1 && reason) continue; // no second disabled button
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'buy', id, qty), reason ?? `Buy ${qty} · ${coins(cost)}`, MAIN, { disabled: !!reason }));
    }
    if (ownedQty > 0 && consumableUses[id] && id !== 'streak_freeze') {
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'use', id), item?.type === 'crate' ? 'Open one now' : 'Use one now', NAV));
    }
  }
  const name = item?.name ?? cosmetic?.name ?? id;
  return {
    embeds: [embed('economy').setTitle(title(sectionLabel, name)).setDescription(lines.join('\n'))],
    components: [row(...buttons)],
  };
}

export const shop: ScreenModule = {
  render(path, ctx) {
    const [, a, b, c] = path;
    if (a === 'tools' && b && TOOL_SLOTS.some((t) => t.slot === b)) return toolScreen(ctx, b as ToolSlot);
    if (a === 'tools') return toolsList(ctx);
    if (a === 'item' && b && c) return itemScreen(ctx, b, c as SectionId);
    if (a && SECTIONS.some((s) => s.id === a)) return sectionScreen(ctx, a as SectionId);
    return root(ctx);
  },

  async act(path, action, args, _i, ctx) {
    const here = path.join('.');
    const ok = icon('success');
    try {
      switch (action) {
        case 'up': {
          const { tool, profile } = await upgrade(ctx.owner, args[0] as ToolSlot);
          return { path: here, note: `${ok} Bought the **${tool.name}**. Wallet ${coins(profile.wallet)}` };
        }
        case 'fix': {
          const { tool, cost, profile } = await repair(ctx.owner, args[0] as ToolSlot);
          return { path: here, note: `${ok} Repaired your ${tool.name} for ${coins(cost)}. Wallet ${coins(profile.wallet)}` };
        }
        case 'buy': {
          const p = await buy(ctx.owner, args[0]!, Number(args[1] ?? 1));
          const next = getCosmetic(args[0]!) ? ' Equip it now?' : consumableUses[args[0]!] ? ' Use it now, or keep shopping.' : '';
          return { path: here, note: `${ok} Bought ${p.qty > 1 ? `${p.qty}× ` : ''}**${p.label}** for ${coins(p.total)}. Wallet ${coins(p.profile.wallet)}.${next}` };
        }
        case 'use':
          return { path: here, note: describeUse(await useItem(ctx.owner, args[0]!, 1)) };
        case 'equip': {
          const c = getCosmetic(args[0]!);
          if (!c || !(ctx.profile.cosmetics?.owned ?? []).includes(c.id)) throw new UserError("You don't own that.");
          await apply(ctx.owner, { set: { [`cosmetics.${c.kind}`]: c.id } }, { source: 'cosmetics.equip' });
          return { path: 'wardrobe', note: `${ok} Equipped **${c.name}**.` };
        }
      }
    } catch (err) {
      if (err instanceof UserError) return { path: here, note: `${icon('error')} ${err.message}` };
      throw err;
    }
    return { path: here };
  },
};


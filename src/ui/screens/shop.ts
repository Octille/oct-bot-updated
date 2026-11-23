import { embed } from '../../lib/embeds';
import { bar, coins } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { nextTool, repairCost, type ToolSlot } from '../../content/tools';
import { basics } from '../../content/shop';
import { cosmetics, getCosmetic } from '../../content/cosmetics';
import { consumableUses } from '../../content/consumables';
import { getItem, itemLabel } from '../../content/items';
import { rarityInfo } from '../../content/rarity';
import { boughtToday, buy, displayName, getRotation } from '../../services/shop';
import { equipped, repair, upgrade } from '../../services/tools';
import { inventoryOf, useItem } from '../../services/items';
import { apply } from '../../services/economy';
import { back, btn, ids, MAIN, NAV, row, select, type Row, type ScreenCtx } from '../kit';
import { describeUse } from './useResult';
import type { ScreenModule } from './types';

const SECTIONS = [
  { id: 'tools', label: 'Tools', emoji: '🧰', description: 'Pickaxe, rod, weapon and shovel — buy or repair' },
  { id: 'cons', label: 'Consumables', emoji: '🧪', description: 'Boosts, bank notes, streak freezes, scratch cards' },
  { id: 'crates', label: 'Crates', emoji: '📦', description: 'Loot crates, including today\'s rare ones' },
  { id: 'deals', label: "Today's deals", emoji: '✨', description: 'Rotates at 00:00 UTC • per-player daily limits' },
  { id: 'cos', label: 'Cosmetics', emoji: '🎨', description: 'Titles and colour themes' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const TOOL_SLOTS: { slot: ToolSlot; label: string; emoji: string; activity: string; activityLabel: string }[] = [
  { slot: 'pickaxe', label: 'Pickaxe', emoji: '⛏️', activity: 'mine', activityLabel: 'Go mining' },
  { slot: 'rod', label: 'Rod', emoji: '🎣', activity: 'fish', activityLabel: 'Go fishing' },
  { slot: 'weapon', label: 'Weapon', emoji: '🏹', activity: 'hunt', activityLabel: 'Go hunting' },
  { slot: 'shovel', label: 'Shovel', emoji: '🪏', activity: 'dig', activityLabel: 'Go digging' },
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
    case 'cos': return cosmetics.filter((c) => !c.rotationOnly).map((c) => ({ id: c.id, kind: 'cosmetic' as const, price: c.price }));
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

function short(n: number): string {
  return coins(n);
}

function needMore(wallet: number, cost: number): string | null {
  return wallet >= cost ? null : `Need ${short(cost - wallet)} more`;
}

function root(ctx: ScreenCtx) {
  const e = embed('economy').setTitle('🛒 Shop')
    .setDescription([ctx.note, `Wallet: **${coins(ctx.profile.wallet)}**`, '', ...SECTIONS.map((s) => `${s.emoji} **${s.label}** — ${s.description}`)].filter((l) => l !== undefined).join('\n'))
    .setFooter({ text: 'Tip: pick a section, then an item.' });
  return {
    embeds: [e],
    components: [
      select(ids.pick(ctx.owner, ctx.origin, 'shop'), 'Pick a section', SECTIONS.map((s) => ({ label: s.label, value: s.id, emoji: s.emoji, description: s.description }))),
      row(back(ctx, null)),
    ],
  };
}

function toolsList(ctx: ScreenCtx) {
  const p = ctx.profile;
  const e = embed('economy').setTitle('🛒 Shop › Tools').setDescription([ctx.note, `Wallet: **${coins(p.wallet)}**`].filter(Boolean).join('\n'))
    .setFooter({ text: 'Tip: pick a tool to upgrade or repair it.' });
  const options = TOOL_SLOTS.map(({ slot, label, emoji }) => {
    const eq = equipped(p, slot);
    const next = nextTool(slot, eq.tool?.id);
    const now = eq.tool ? `${eq.tool.name} ${eq.durability}/${eq.tool.durability}${eq.broken ? ' (broken)' : ''}` : 'none';
    e.addFields({ name: `${emoji} ${label}`, value: `${now}${next ? `\nNext: ${next.name} — ${coins(next.cost)}` : '\nBest in the game'}`, inline: true });
    return { label, value: slot, emoji, description: eq.tool ? now : `Not owned${next ? ` — ${next.name} ${coins(next.cost)}` : ''}` };
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
  lines.push(eq.tool
    ? `**Now:** ${eq.tool.emoji} ${eq.tool.name} ${bar(eq.durability, eq.tool.durability, 10)} ${eq.durability}/${eq.tool.durability}${eq.broken ? ' — **broken**' : ''}`
    : `**Now:** none`);
  const fixCost = eq.tool && eq.durability < eq.tool.durability ? repairCost(eq.tool, eq.durability) : 0;
  if (fixCost) lines.push(`🔧 Repair to full: **${coins(fixCost)}**`);
  if (next) {
    const stat = slot === 'pickaxe' ? `${next.mult}× haul`
      : slot === 'shovel' ? `${next.digs} digs, luck +${next.luck}, ${next.valueMult}× value`
      : `luck +${next.luck}, ${next.valueMult}× value, +${(next.windowBonusMs ?? 0) / 1000}s reaction time`;
    lines.push('', `**Next:** ${next.emoji} ${next.name} — ${stat}`, `Costs **${coins(next.cost)}** → wallet after **${coins(p.wallet - next.cost)}**${next.level > level ? ` • needs level ${next.level}` : ''}`);
  } else lines.push('', '🏆 You have the best one.');
  lines.push('', `Wallet: ${coins(p.wallet)}`);

  const buttons = [back(ctx, 'shop.tools')];
  if (fixCost) {
    const short = needMore(p.wallet, fixCost);
    buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'fix', slot), short ?? `Repair — ${coins(fixCost)}`, eq.broken ? MAIN : NAV, { emoji: '🔧', disabled: !!short }));
  }
  if (next) {
    const reason = next.level > level ? `Needs level ${next.level}` : needMore(p.wallet, next.cost);
    buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'up', slot), reason ?? `Buy ${next.name} — ${coins(next.cost)}`, MAIN, { emoji: '⬆️', disabled: !!reason }));
  }
  if (eq.tool && !eq.broken) buttons.push(btn(ids.go(ctx.owner, meta.activity), meta.activityLabel, NAV, { emoji: meta.emoji }));

  return {
    embeds: [embed('economy').setTitle(`🛒 Shop › Tools › ${meta.label}`).setDescription(lines.join('\n'))],
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
    const status = l.kind === 'cosmetic' && owned.has(l.id) ? ' • owned ✅'
      : l.limit ? ` • ${boughtToday(p, l.id, day)}/${l.limit} today` : '';
    return `${displayName(l)} — **${coins(l.price)}**${status}`;
  });
  const e = embed('economy').setTitle(`🛒 Shop › ${meta.label}`)
    .setDescription([ctx.note, `Wallet: **${coins(p.wallet)}**`, '', ...lines].filter((l) => l !== undefined).join('\n'))
    .setFooter({ text: section === 'deals' ? 'Changes at 00:00 UTC. Limits are per player.' : 'Tip: pick an item to see details and buy.' });
  const components: Row[] = [];
  if (listings.length) {
    components.push(select(ids.pick(ctx.owner, ctx.origin, 'shop.item'), 'Pick an item', listings.map((l) => {
      const name = displayName(l).replace(/^\S+ /, '');
      const emoji = l.kind === 'cosmetic' ? (getCosmetic(l.id)?.kind === 'title' ? '🏷️' : '🎨') : getItem(l.id)?.emoji;
      return { label: name, value: `${l.id}.${section}`, emoji, description: `${coins(l.price)}${l.limit ? ` • limit ${l.limit}/day` : ''}` };
    })));
  }
  components.push(row(back(ctx, 'shop')));
  return { embeds: [e], components };
}

function itemScreen(ctx: ScreenCtx, id: string, section: SectionId) {
  const p = ctx.profile;
  const listing = findListing(id);
  const path = `shop.item.${id}.${section}`;
  if (!listing) {
    return { embeds: [embed('economy').setTitle('🛒 Shop').setDescription(`${ctx.note ?? ''}\nThat's no longer for sale.`)], components: [row(back(ctx, `shop.${section}`))] };
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
    item ? `${rarityInfo[item.rarity].emoji} ${item.description}` : cosmetic?.kind === 'title' ? `A title shown next to your name: **${cosmetic.value}**` : 'A colour theme for your embeds.',
    '',
    `Price: **${coins(listing.price)}** → wallet after **${coins(p.wallet - listing.price)}**`,
    item ? `You own: **${ownedQty}**` : ownsCosmetic ? 'You own this ✅' : null,
    listing.limit ? `Today: ${bought}/${listing.limit} bought (resets 00:00 UTC)` : null,
  ].filter((l) => l !== null && l !== undefined);

  const buttons = [back(ctx, `shop.${section}`)];
  if (cosmetic) {
    if (ownsCosmetic) buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'equip', id), 'Equip it', MAIN, { emoji: '✨' }));
    else {
      const reason = left <= 0 ? 'Daily limit reached' : needMore(p.wallet, listing.price);
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'buy', id, 1), reason ?? `Buy — ${coins(listing.price)}`, MAIN, { emoji: '🛒', disabled: !!reason }));
    }
  } else {
    const canMulti = !listing.limit;
    for (const qty of canMulti ? [1, 5] : [1]) {
      const cost = listing.price * qty;
      const reason = left < qty ? 'Daily limit reached' : needMore(p.wallet, cost);
      if (qty > 1 && reason) continue; // don't clutter with a second disabled button
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'buy', id, qty), reason ?? `Buy ${qty} — ${coins(cost)}`, MAIN, { emoji: '🛒', disabled: !!reason }));
    }
    if (ownedQty > 0 && consumableUses[id] && id !== 'streak_freeze') {
      buttons.push(btn(ids.act(ctx.owner, ctx.origin, path, 'use', id), item?.type === 'crate' ? 'Open one now' : 'Use one now', NAV, { emoji: item?.type === 'crate' ? '📦' : '✨' }));
    }
  }
  const title = item ? `${item.emoji} ${item.name}` : `${cosmetic?.kind === 'title' ? '🏷️' : '🎨'} ${cosmetic?.name}`;
  return {
    embeds: [embed('economy').setTitle(`🛒 Shop › ${SECTIONS.find((s) => s.id === section)!.label} › ${title}`).setDescription(lines.join('\n'))],
    components: [row(...buttons)],
  };
}

export const shop: ScreenModule = {
  render(path, ctx) {
    const [, a, b, c] = path;
    if (a === 'tools' && b && TOOL_SLOTS.some((t) => t.slot === b)) return toolScreen(ctx, b as ToolSlot);
    if (a === 'tools') return toolsList(ctx);
    if (a === 'item' && b && c) return itemScreen(ctx, b, c as SectionId);
    if (a && SECTIONS.some((s) => s.id === a)) return a === 'tools' ? toolsList(ctx) : sectionScreen(ctx, a as SectionId);
    return root(ctx);
  },

  async act(path, action, args, _i, ctx) {
    const here = path.join('.');
    try {
      switch (action) {
        case 'up': {
          const { tool, profile } = await upgrade(ctx.owner, args[0] as ToolSlot);
          return { path: here, note: `✅ Bought ${tool.emoji} **${tool.name}**. Wallet: ${coins(profile.wallet)}` };
        }
        case 'fix': {
          const { tool, cost, profile } = await repair(ctx.owner, args[0] as ToolSlot);
          return { path: here, note: `🔧 Repaired your ${tool.name} for ${coins(cost)}. Wallet: ${coins(profile.wallet)}` };
        }
        case 'buy': {
          const p = await buy(ctx.owner, args[0]!, Number(args[1] ?? 1));
          const next = getCosmetic(args[0]!) ? 'Equip it now?' : consumableUses[args[0]!] ? 'Use it now, or keep shopping.' : '';
          return { path: here, note: `✅ Bought ${p.qty > 1 ? `${p.qty}× ` : ''}${p.label} for ${coins(p.total)}. Wallet: ${coins(p.profile.wallet)}. ${next}`.trim() };
        }
        case 'use': {
          const result = await useItem(ctx.owner, args[0]!, 1);
          return { path: here, note: describeUse(result) };
        }
        case 'equip': {
          const c = getCosmetic(args[0]!);
          if (!c || !(ctx.profile.cosmetics?.owned ?? []).includes(c.id)) throw new UserError("You don't own that.");
          await apply(ctx.owner, { set: { [`cosmetics.${c.kind}`]: c.id } }, { source: 'cosmetics.equip' });
          return { path: 'wardrobe', note: `✨ Equipped **${c.name}**.` };
        }
      }
    } catch (err) {
      if (err instanceof UserError) return { path: here, note: `❌ ${err.message}` };
      throw err;
    }
    return { path: here };
  },
};

export { itemLabel };

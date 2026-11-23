import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { getCosmetic } from '../../content/cosmetics';
import { prestigeIncomeBonus } from '../../content/levels';
import { MAX_PRESTIGE, perks, prestigeCosmeticCost, prestigeLevel, prestigeNumerals, tokensFor, type PerkId } from '../../content/prestige';
import { buyPerk, buyPrestigeCosmetic, canPrestige, prestige, prestigeLoot } from '../../services/prestige';
import { inventoryValue } from '../../services/items';
import { getItem, type ItemType } from '../../content/items';
import { back, btn, DANGER, ids, MAIN, NAV, row, select, type Payload, type ScreenCtx } from '../kit';
import type { ScreenModule } from './types';

const numeral = (p: number) => (p ? prestigeNumerals[p] ?? String(p) : '0');

const LOSE = 'your level and XP, wallet, bank, and all fish, gems, treasure, other loot and unopened crates';
const KEEP = 'tools, consumables, cosmetics, achievements, fishdex progress, job ranks, streaks and everything you unlocked';

const LOOT_LABEL: Partial<Record<ItemType, [string, string]>> = {
  fish: ['fish', 'fish'], material: ['gem or material', 'gems and materials'], collectible: ['treasure or find', 'treasure and finds'], crate: ['crate', 'crates'],
};

/** "12 fish, 3 gems and materials, 1 crate (sells for ₪8,400)" */
function lootSummary(p: ScreenCtx['profile']): string {
  const loot = prestigeLoot(p);
  const byType = new Map<ItemType, number>();
  for (const [id, q] of Object.entries(loot)) {
    const t = getItem(id)!.type;
    byType.set(t, (byType.get(t) ?? 0) + q);
  }
  if (!byType.size) return 'none';
  const parts = [...byType].map(([t, n]) => `${n} ${LOOT_LABEL[t]![n === 1 ? 0 : 1]}`);
  return `**${parts.join(', ')}** (sells for ${coins(inventoryValue(loot))})`;
}

function main(ctx: ScreenCtx): Payload {
  const p = ctx.profile;
  const current = p.account?.prestige ?? 0;
  const level = p.account?.level ?? 0;
  const check = canPrestige(p);
  const owned = perks.filter((x) => p.prestige?.perks?.includes(x.id));
  const e = embed('levels')
    .setTitle(`${titleIcon('prestige')} Prestige`)
    .setDescription([
      ctx.note,
      `Prestige **${numeral(current)}** of ${MAX_PRESTIGE} · **${p.prestige?.tokens ?? 0}** prestige token${(p.prestige?.tokens ?? 0) === 1 ? '' : 's'}`,
      current ? `Your bonus: **+${Math.round(current * prestigeIncomeBonus * 100)}%** coins from everything${owned.length ? ` · Perks: ${owned.map((x) => x.name).join(', ')}` : ''}` : null,
      '',
      current >= MAX_PRESTIGE
        ? "You've reached the top. Nothing left but bragging rights."
        : `**Next prestige** needs account level **${prestigeLevel}** (you're ${level}).`,
      current < MAX_PRESTIGE ? `You get: **+${Math.round(prestigeIncomeBonus * 100)}%** coins for good, **${tokensFor(current + 1)}** prestige token${tokensFor(current + 1) === 1 ? '' : 's'} and the Prestige ${numeral(current + 1)} marker on your cards.` : null,
      current < MAX_PRESTIGE ? `You lose: ${LOSE}.` : null,
      current < MAX_PRESTIGE ? `You keep: ${KEEP}.` : null,
    ].filter((l) => l !== null && l !== undefined).join('\n'));
  return {
    embeds: [e],
    components: [row(
      back(ctx, null),
      btn(ids.nav(ctx.owner, ctx.origin, 'prestige.shop'), 'Prestige shop', NAV),
      btn(ids.nav(ctx.owner, ctx.origin, 'prestige.confirm'), check.ok ? `Prestige to ${numeral(current + 1)}` : current >= MAX_PRESTIGE ? 'Max prestige' : `Level ${prestigeLevel} needed`, MAIN, { disabled: !check.ok }),
    )],
  };
}

function confirm(ctx: ScreenCtx): Payload {
  const p = ctx.profile;
  const current = p.account?.prestige ?? 0;
  if (!canPrestige(p).ok) return main(ctx);
  const e = embed('levels')
    .setTitle(`${titleIcon('prestige')} Prestige › Are you sure?`)
    .setDescription([
      `${icon('warning')} This resets your progress. It can't be undone.`,
      '',
      '**You will lose:**',
      `· Account level **${p.account?.level ?? 0}** → **0** (and its XP)`,
      `· Wallet **${coins(p.wallet)}** → **${coins(1_000)}**`,
      `· Bank **${coins(p.bank)}** → **${coins(0)}**`,
      `· Loot: ${lootSummary(p)}`,
      '',
      `**You keep:** ${KEEP}.`,
      '',
      `You become **Prestige ${numeral(current + 1)}**: +${Math.round(prestigeIncomeBonus * 100)}% coins for good and ${tokensFor(current + 1)} prestige token${tokensFor(current + 1) === 1 ? '' : 's'}.`,
      'Tip: sell your loot and spend your coins on tool upgrades first.',
    ].join('\n'));
  return {
    embeds: [e],
    components: [row(
      back(ctx, 'prestige'),
      btn(ids.act(ctx.owner, ctx.origin, 'prestige', 'do', current), `Prestige to ${numeral(current + 1)}`, DANGER),
    )],
  };
}

function shop(ctx: ScreenCtx): Payload {
  const p = ctx.profile;
  const current = p.account?.prestige ?? 0;
  const tokens = p.prestige?.tokens ?? 0;
  const owned = new Set([...(p.prestige?.perks ?? []), ...(p.cosmetics?.owned ?? [])]);
  const entries = [
    ...perks.map((x) => ({ id: x.id, kind: 'perk' as const, name: x.name, cost: x.cost, min: x.minPrestige, what: x.description })),
    ...Object.entries(prestigeCosmeticCost).map(([id, cost]) => {
      const c = getCosmetic(id)!;
      return { id, kind: 'cos' as const, name: c.name, cost, min: c.minPrestige ?? 1, what: c.kind === 'title' ? `Title "${c.value}"` : c.kind === 'theme' ? 'Colour theme' : 'Card background' };
    }),
  ];
  const lines = entries.map((x) => {
    const status = owned.has(x.id) ? `${icon('success')} Owned` : current < x.min ? `${icon('locked')} Prestige ${numeral(x.min)}` : `${x.cost} token${x.cost === 1 ? '' : 's'}`;
    return `**${x.name}** · ${x.what}\n-# ${status}`;
  });
  const buyable = entries.filter((x) => !owned.has(x.id) && current >= x.min && tokens >= x.cost);
  const e = embed('levels')
    .setTitle(`${titleIcon('prestige')} Prestige › Shop`)
    .setDescription([ctx.note, `You have **${tokens}** prestige token${tokens === 1 ? '' : 's'}. Perks are permanent and stay through every prestige.`, '', ...lines].filter((l) => l !== undefined).join('\n'));
  const components = [];
  if (buyable.length) {
    components.push(select(ids.act(ctx.owner, ctx.origin, 'prestige.shop', 'buy'), 'Buy with tokens', buyable.slice(0, 10).map((x) => ({
      label: `${x.name} · ${x.cost} token${x.cost === 1 ? '' : 's'}`, value: `${x.kind}:${x.id}`, description: x.what,
    }))));
  }
  components.push(row(back(ctx, 'prestige')));
  return { embeds: [e], components };
}

/** prestige · prestige.confirm · prestige.shop */
export const prestigeScreen: ScreenModule = {
  render(path, ctx) {
    if (path[1] === 'confirm') return confirm(ctx);
    if (path[1] === 'shop') return shop(ctx);
    return main(ctx);
  },

  async act(_path, action, args, interaction, ctx) {
    if (action === 'do') {
      // The button carries the prestige it was shown for, so a stale or double click does nothing
      if (Number(args[0]) !== (ctx.profile.account?.prestige ?? 0)) return { path: 'prestige' };
      try {
        const r = await prestige(ctx.owner);
        return { path: 'prestige', note: `${icon('success')} **Prestige ${numeral(r.prestige)}!** +${r.tokens} prestige token${r.tokens === 1 ? '' : 's'}. Your level starts again from 0, with a permanent coin bonus.` };
      } catch (err) {
        if (err instanceof UserError) return { path: 'prestige', note: `${icon('error')} ${err.message}` };
        return { path: 'prestige', note: `${icon('error')} Your balance changed while prestiging. Try again.` };
      }
    }
    if (action === 'buy' && interaction.isStringSelectMenu()) {
      const [kind, id] = (interaction.values[0] ?? '').split(':') as [string, string];
      try {
        if (kind === 'perk') await buyPerk(ctx.owner, id as PerkId);
        else await buyPrestigeCosmetic(ctx.owner, id);
        const name = kind === 'perk' ? perks.find((x) => x.id === id)?.name : getCosmetic(id)?.name;
        return { path: 'prestige.shop', note: `${icon('success')} Bought **${name}**.${kind === 'cos' ? ' Equip it in the Wardrobe.' : ''}` };
      } catch (err) {
        if (err instanceof UserError) return { path: 'prestige.shop', note: `${icon('error')} ${err.message}` };
        throw err;
      }
    }
    return { path: 'prestige' };
  },
};

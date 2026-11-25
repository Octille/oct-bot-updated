import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { businessRules, businessTiers, hireCost } from '../../content/business';
import { buyTier, capHours, collectBusiness, hireManager, hireWorker, incomePerHour, pendingIncome, tierOf } from '../../services/business';
import { unlockLevel } from '../../services/progression';
import { back, btn, ids, MAIN, NAV, row, type Payload, type ScreenCtx } from '../kit';
import type { ScreenModule } from './types';

function view(ctx: ScreenCtx): Payload {
  const p = ctx.profile;
  const level = unlockLevel(p);
  const t = tierOf(p.business?.tier);
  const idx = businessTiers.findIndex((x) => x.id === p.business?.tier);
  const next = businessTiers[idx + 1];
  if (!t) {
    const first = businessTiers[0]!;
    const e = embed('economy').setTitle(`${titleIcon('business')} Business`).setDescription([
      ctx.note,
      'Own a business: hire workers and they earn while you play (or sleep). Collect what they make, up to 8 hours at a time.',
      '',
      ...businessTiers.map((x) => `${x.emoji} **${x.name}** · ${coins(x.price)} · ${coins(x.perWorkerHour)} per worker per hour · level ${x.level}`),
    ].filter((l) => l !== undefined).join('\n'));
    const can = level >= first.level;
    return { embeds: [e], components: [row(back(ctx, null), btn(ids.act(ctx.owner, ctx.origin, 'biz', 'buy', first.id), can ? `Open a ${first.name} · ${coins(first.price)}` : `Level ${first.level} needed`, MAIN, { disabled: !can || p.wallet < first.price }))] };
  }
  const workers = p.business?.workers ?? 0;
  const pending = pendingIncome(p);
  const cap = capHours(p);
  const full = workers >= t.maxWorkers;
  const managerCost = Math.round(t.price * businessRules.managerShare);
  const e = embed('economy').setTitle(`${titleIcon('business')} Business › ${t.name}`).setDescription([
    ctx.note,
    `${t.emoji} **${t.name}** · ${workers} / ${t.maxWorkers} workers · **${coins(incomePerHour(p))}** an hour (before ${Math.round(businessRules.upkeep * 100)}% upkeep)`,
    `Ready to collect: **${coins(pending.amount)}**${pending.capped ? ` (full: it stops at ${cap}h)` : ` (fills up in ${Math.max(0, Math.ceil(cap - pending.hours))}h)`}`,
    p.business?.manager ? `Manager: collects for you every ${businessRules.managerCollectHours}h and holds up to ${businessRules.managerCapHours}h.` : `No manager: income stops after ${businessRules.offlineCapHours}h until you collect.`,
    next ? `Next: ${next.emoji} **${next.name}** (${coins(next.perWorkerHour)} per worker per hour) · level ${next.level}` : 'This is the biggest business there is.',
    `-# Earned so far: ${coins(p.business?.collected ?? 0)}. Collecting sometimes brings a rush hour, or a bill.`,
  ].filter((l) => l !== undefined).join('\n'));
  const nextCan = next && level >= next.level;
  return {
    embeds: [e],
    components: [
      row(
        btn(ids.act(ctx.owner, ctx.origin, 'biz', 'hire'), full ? 'Fully staffed' : `Hire · ${coins(hireCost(t.id, workers))}`, NAV, { disabled: full || p.wallet < hireCost(t.id, workers) }),
        btn(ids.act(ctx.owner, ctx.origin, 'biz', 'manager'), p.business?.manager ? 'Manager hired' : `Manager · ${coins(managerCost)}`, NAV, { disabled: !!p.business?.manager || p.wallet < managerCost }),
        ...(next ? [btn(ids.act(ctx.owner, ctx.origin, 'biz', 'buy', next.id), nextCan ? `Upgrade · ${coins(next.price)}` : `Upgrade at level ${next.level}`, NAV, { disabled: !nextCan || p.wallet < next.price })] : []),
      ),
      row(
        back(ctx, null),
        btn(ids.nav(ctx.owner, ctx.origin, 'biz'), 'Refresh', NAV),
        btn(ids.act(ctx.owner, ctx.origin, 'biz', 'collect'), pending.amount > 0 ? `Collect · ${coins(pending.amount)}` : 'Nothing to collect', MAIN, { disabled: pending.amount <= 0 }),
      ),
    ],
  };
}

/** biz */
export const businessScreen: ScreenModule = {
  render(_path, ctx) {
    return view(ctx);
  },

  async act(_path, action, args, _i, ctx) {
    try {
      switch (action) {
        case 'collect': {
          const r = await collectBusiness(ctx.owner);
          return { path: 'biz', note: [`${icon('success')} Collected **${coins(r.amount)}**.`, r.event.line ? `${r.event.mult >= 1 ? icon('success') : icon('warning')} ${r.event.line}` : null].filter(Boolean).join('\n') };
        }
        case 'hire': {
          const cost = await hireWorker(ctx.owner);
          return { path: 'biz', note: `${icon('success')} Hired a worker for ${coins(cost)}. Anything waiting was collected first.` };
        }
        case 'manager': {
          const cost = await hireManager(ctx.owner);
          return { path: 'biz', note: `${icon('success')} Hired a manager for ${coins(cost)}.` };
        }
        case 'buy': {
          const tier = businessTiers.find((x) => x.id === args[0]);
          if (!tier) return { path: 'biz' };
          await buyTier(ctx.owner, tier.id);
          return { path: 'biz', note: `${icon('success')} You now own a **${tier.name}**! Your workers came along.` };
        }
      }
    } catch (err) {
      if (err instanceof UserError) return { path: 'biz', note: `${icon('error')} ${err.message}` };
      throw err;
    }
    return { path: 'biz' };
  },
};


import { embed } from '../../lib/embeds';
import { coins, relative } from '../../lib/format';
import { bailCost, isJailed, payBail } from '../../services/jail';
import { back, btn, ids, MAIN, NAV, row } from '../kit';
import type { ScreenModule } from './types';

export const jail: ScreenModule = {
  render(_path, ctx) {
    const p = ctx.profile;
    if (!isJailed(p.jailUntil)) {
      return {
        embeds: [embed('success').setTitle('🔓 Free').setDescription([ctx.note, "You're not in jail. Earning commands work again."].filter(Boolean).join('\n'))],
        components: [row(back(ctx, null))],
      };
    }
    const cost = bailCost(p.jailUntil!);
    const short = p.wallet < cost ? `Need ${coins(cost - p.wallet)} more` : null;
    return {
      embeds: [embed('moderation').setTitle('🚔 Jail').setDescription([
        ctx.note,
        `You're free ${relative(p.jailUntil!)}.`,
        `Bail: **${coins(cost)}** → wallet after **${coins(p.wallet - cost)}**`,
      ].filter(Boolean).join('\n'))],
      components: [row(
        back(ctx, null),
        btn(ids.act(ctx.owner, ctx.origin, 'jail', 'bail'), short ?? `Pay bail — ${coins(cost)}`, MAIN, { emoji: '💸', disabled: !!short }),
        btn(ids.nav(ctx.owner, ctx.origin, 'jail'), 'Wait it out', NAV, { emoji: '⏳', disabled: true }),
      )],
    };
  },
  async act(_path, action, _args, _i, ctx) {
    if (action === 'bail') {
      const cost = await payBail(ctx.owner);
      return { path: 'jail', note: `💸 You paid ${coins(cost)} bail.` };
    }
    return { path: 'jail' };
  },
};

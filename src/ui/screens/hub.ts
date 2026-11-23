import { embed } from '../../lib/embeds';
import { coins, relative } from '../../lib/format';
import { testNotice } from '../../lib/testMode';
import { itemLabel } from '../../content/items';
import { bailCost, isJailed, payBail } from '../../services/jail';
import { capacityOf } from '../../services/economy';
import { firstSteps, ONBOARDING_REWARD, onboardingVisible } from '../../services/onboarding';
import { activities, statusOf, statusText } from '../activities';
import { btn, ids, MAIN, NAV, row, type ScreenCtx } from '../kit';
import type { ScreenModule } from './types';
import { levelFromXp } from '../../content/levels';

/** Seconds since epoch in base 36, stamped on hub activity buttons to detect stale hubs. */
export function hubStamp(now = Date.now()): string {
  return Math.floor(now / 1000).toString(36);
}

/** Hubs older than this show an "expired" reply instead of starting activities. */
export const HUB_TTL_MS = 15 * 60_000;

export function hubExpired(stamp: string | undefined, now = Date.now()): boolean {
  if (!stamp) return false;
  return now - parseInt(stamp, 36) * 1000 > HUB_TTL_MS;
}

export const hub: ScreenModule = {
  render(_path, ctx: ScreenCtx) {
    const p = ctx.profile;
    const now = new Date();
    const stamp = hubStamp(now.getTime());
    const jailed = isJailed(p.jailUntil, now.getTime());
    const { level } = levelFromXp(p.account?.xp ?? 0);

    const e = embed('economy')
      .setTitle('🏠 Menu')
      .setDescription([
        ctx.note,
        `👛 **${coins(p.wallet)}** • 🏦 ${coins(p.bank)} / ${coins(capacityOf(p)).replace('₪ ', '')} • ⭐ Level ${level}`,
        jailed ? `🚔 **You're in jail** — free ${relative(p.jailUntil!)}, or pay bail below.` : null,
        testNotice(),
      ].filter(Boolean).join('\n'))
      .addFields({
        name: 'Activities',
        value: activities.map((a) => `${a.emoji} ${a.name} — ${statusText(statusOf(a.id, p, now), now)}`).join('\n'),
      })
      .setFooter({ text: 'Tip: green buttons are ready right now. This menu refreshes with 🔄.' });

    if (onboardingVisible(p)) {
      const steps = firstSteps(p);
      e.addFields({
        name: '🧭 First steps',
        value: steps.map((s, n) => `${s.done ? '✅' : '⬜'} ${n + 1}. ${s.label}`).join('\n') +
          `\nFinish all three for a free ${itemLabel(ONBOARDING_REWARD)}.`,
      });
    }

    const activityButtons = activities.map((a) => {
      const s = statusOf(a.id, p, now);
      switch (s.state) {
        case 'ready': return btn(ids.go(ctx.owner, a.id, stamp), a.ready, MAIN, { emoji: a.emoji });
        case 'cooldown': return btn(ids.go(ctx.owner, a.id, stamp), `${a.name} — ${relativeShort(s.readyAt, now)}`, NAV, { emoji: a.emoji, disabled: true });
        // Clickable: takes you to the fix (e.g. Shop › Tools › Weapon)
        case 'needs': return btn(ids.nav(ctx.owner, 'h', s.fix), s.label, NAV, { emoji: a.emoji });
        case 'locked': return btn(ids.go(ctx.owner, a.id, stamp), s.label, NAV, { emoji: a.emoji, disabled: true });
      }
    });

    const rows = [row(...activityButtons.slice(0, 5)), row(...activityButtons.slice(5, 10))];
    if (jailed) rows.push(row(btn(ids.act(ctx.owner, 'h', 'hub', 'bail'), `Pay bail — ${coins(bailCost(p.jailUntil!))}`, MAIN, { emoji: '💸', disabled: p.wallet < bailCost(p.jailUntil!) })));
    rows.push(row(
      btn(ids.nav(ctx.owner, 'h', 'shop'), 'Shop', NAV, { emoji: '🛒' }),
      btn(ids.nav(ctx.owner, 'h', 'inv.all.0'), 'Inventory', NAV, { emoji: '🎒' }),
      btn(ids.nav(ctx.owner, 'h', 'bal'), 'Balance', NAV, { emoji: '👛' }),
      btn(ids.nav(ctx.owner, 'h', 'help'), 'Help', NAV, { emoji: '📖' }),
      btn(ids.nav(ctx.owner, 'h', 'hub'), 'Refresh', NAV, { emoji: '🔄' }),
    ));
    return { embeds: [e], components: rows };
  },

  async act(_path, action, _args, _i, ctx) {
    if (action === 'bail') {
      const cost = await payBail(ctx.owner);
      return { path: 'hub', note: `🔓 You paid ${coins(cost)} bail. You're free.` };
    }
    return { path: 'hub' };
  },
};

/** "4m", "2h 5m" for button labels. */
function relativeShort(at: Date, now: Date): string {
  const s = Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.ceil(s / 60)}m`;
  return `${s}s`;
}


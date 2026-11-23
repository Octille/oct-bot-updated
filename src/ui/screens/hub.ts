import { embed } from '../../lib/embeds';
import { coins, duration, relative } from '../../lib/format';
import { testNotice } from '../../lib/testMode';
import { itemName } from '../../content/items';
import { buttonIcon, icon, titleIcon } from '../../lib/icons';
import type { IconKey } from '../../content/icons';
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

    const half = Math.ceil(activities.length / 2);
    const statusLine = (a: (typeof activities)[number]) => `${a.name} · ${statusText(statusOf(a.id, p, now), now)}`;
    const e = embed('economy')
      .setTitle(`${titleIcon('menu')} Menu`)
      .setDescription([
        ctx.note,
        `${icon('currency')} **${coins(p.wallet)}** wallet · ${coins(p.bank)} / ${coins(capacityOf(p)).replace('₪ ', '')} bank · Level ${level}`,
        jailed ? `${icon('jail')} **You're in jail** until ${relative(p.jailUntil!)}. Pay bail below to get out now.` : null,
        testNotice(),
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: 'Activities', value: activities.slice(0, half).map(statusLine).join('\n'), inline: true },
        { name: '\u200b', value: activities.slice(half).map(statusLine).join('\n'), inline: true },
      )
      .setFooter({ text: 'Tip: green buttons are ready now. Refresh to update the timers.' });

    if (onboardingVisible(p)) {
      const steps = firstSteps(p);
      e.addFields({
        name: `First steps ${steps.filter((s) => s.done).length}/${steps.length}`,
        value: steps.map((s) => (s.done ? `~~${s.label}~~ ✓` : s.label)).join(' · ') +
          `\nFinish all three for a free ${itemName(ONBOARDING_REWARD)}.`,
      });
    }

    const activityButtons = activities.map((a) => {
      const s = statusOf(a.id, p, now);
      switch (s.state) {
        case 'ready': return btn(ids.go(ctx.owner, a.id, stamp), a.ready, MAIN, { emoji: buttonIcon(a.id as IconKey) });
        case 'cooldown': return btn(ids.go(ctx.owner, a.id, stamp), `${a.name} · ${duration(s.readyAt.getTime() - now.getTime())}`, NAV, { disabled: true });
        // Clickable: takes you to the fix (e.g. Shop › Tools › Weapon)
        case 'needs': return btn(ids.nav(ctx.owner, 'h', s.fix), s.label, NAV);
        case 'locked': return btn(ids.go(ctx.owner, a.id, stamp), s.label, NAV, { disabled: true });
      }
    });

    const rows = [row(...activityButtons.slice(0, 5)), row(...activityButtons.slice(5, 10))];
    if (jailed) {
      const cost = bailCost(p.jailUntil!);
      rows.push(row(btn(ids.act(ctx.owner, 'h', 'hub', 'bail'), p.wallet >= cost ? `Pay bail · ${coins(cost)}` : `Need ${coins(cost - p.wallet)} more`, MAIN, { disabled: p.wallet < cost })));
    }
    rows.push(row(
      btn(ids.nav(ctx.owner, 'h', 'shop'), 'Shop', NAV),
      btn(ids.nav(ctx.owner, 'h', 'inv.all.0'), 'Inventory', NAV),
      btn(ids.nav(ctx.owner, 'h', 'bal'), 'Balance', NAV),
      btn(ids.nav(ctx.owner, 'h', 'help'), 'Help', NAV),
      btn(ids.nav(ctx.owner, 'h', 'hub'), 'Refresh', NAV),
    ));
    return { embeds: [e], components: rows };
  },

  async act(_path, action, _args, _i, ctx) {
    if (action === 'bail') {
      const cost = await payBail(ctx.owner);
      return { path: 'hub', note: `${icon('success')} You paid ${coins(cost)} bail. You're free.` };
    }
    return { path: 'hub' };
  },
};


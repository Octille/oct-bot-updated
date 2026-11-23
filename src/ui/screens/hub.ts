import { embed } from '../../lib/embeds';
import { bar, coins, relative, timeLeft } from '../../lib/format';
import { canPrestige } from '../../services/prestige';
import { testNotice } from '../../lib/testMode';
import { itemName } from '../../content/items';
import { buttonIcon, icon, titleIcon } from '../../lib/icons';
import type { IconKey } from '../../content/icons';
import { bailCost, isJailed, payBail } from '../../services/jail';
import { capacityOf } from '../../services/economy';
import { firstSteps, ONBOARDING_REWARD, onboardingVisible } from '../../services/onboarding';
import { activities, statusOf, statusText } from '../activities';
import { btn, ids, MAIN, MORE, NAV, row, select, SUGGESTED, type ScreenCtx } from '../kit';
import { suggestedActivity } from '../suggest';
import { unlockLevel, unlocksBetween } from '../../services/progression';
import type { ScreenModule } from './types';
import { levelFromXp, prestigeIncomeBonus } from '../../content/levels';

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

/** Prestige shows in the More menu from this level (or once you've prestiged). */
const PRESTIGE_MENU_LEVEL = 30;

/** "Level 20 unlocks Doctor job", for the first level above `from` that unlocks something. */
function nextUnlock(from: number): string | null {
  for (let l = from + 1; l <= from + 60; l++) {
    const u = unlocksBetween(l - 1, l);
    if (u.length) return `Level ${l} unlocks ${u.join(', ')}`;
  }
  return null;
}

export const hub: ScreenModule = {
  render(_path, ctx: ScreenCtx) {
    const p = ctx.profile;
    const now = new Date();
    const stamp = hubStamp(now.getTime());
    const jailed = isJailed(p.jailUntil, now.getTime());
    const { level, into, needed } = levelFromXp(p.account?.xp ?? 0);
    const unlockAt = unlockLevel(p);
    const next = nextUnlock(Math.max(level, unlockAt));
    const streak = p.streak?.count ?? 0;
    const dailyReady = statusOf('daily', p, now).state === 'ready';
    const onboarding = onboardingVisible(p);
    const canPrestigeNow = canPrestige(p).ok;

    const e = embed('economy')
      .setTitle(`${titleIcon('menu')} Menu`)
      .setDescription([
        ctx.note,
        `${icon('currency')} **${coins(p.wallet)}** wallet · ${coins(p.bank)} / ${coins(capacityOf(p)).replace('₪ ', '')} bank`,
        canPrestigeNow
          ? `✨ **You can prestige now:** +${Math.round(prestigeIncomeBonus * 100)}% coins forever`
          : `**Level ${level}** ${bar(into, needed)} ${Math.floor((into / needed) * 100)}%${next ? ` → ${next}` : ` → Level ${level + 1}`}`,
        `Daily streak: **${streak} day${streak === 1 ? '' : 's'}**${dailyReady ? ' · daily ready' : ''}`,
        jailed ? `${icon('jail')} **You're in jail** until ${relative(p.jailUntil!)}. Pay bail below to get out now.` : null,
        testNotice(),
      ].filter(Boolean).join('\n'));
    // The tip only helps until First steps are done
    if (onboarding) e.setFooter({ text: 'Tip: the blue button is the best thing to do next; green ones are ready too.' });

    if (onboarding) {
      const steps = firstSteps(p);
      e.addFields({
        name: `First steps ${steps.filter((s) => s.done).length}/${steps.length}`,
        value: steps.map((s) => (s.done ? `~~${s.label}~~ ✓` : s.label)).join(' · ') +
          `\nFinish all three for a free ${itemName(ONBOARDING_REWARD)}.`,
      });
    }

    const statuses = activities.map((a) => ({ a, s: statusOf(a.id, p, now) }));
    const ready = statuses.filter((x) => x.s.state === 'ready').map((x) => x.a.id);
    const suggested = suggestedActivity(p, ready, canPrestigeNow);
    // Ready first (suggested at the front), then needs/locked, cooldowns last
    const rank = (x: (typeof statuses)[number]) =>
      x.a.id === suggested ? 0 : x.s.state === 'ready' ? 1 : x.s.state === 'needs' ? 2 : x.s.state === 'locked' ? 3 : 4;
    const ordered = [...statuses].sort((x, y) => rank(x) - rank(y));

    const activityButtons = ordered.map(({ a, s }) => {
      switch (s.state) {
        case 'ready': return btn(ids.go(ctx.owner, a.id, stamp), a.ready, a.id === suggested ? SUGGESTED : MAIN, { emoji: buttonIcon(a.id as IconKey) });
        case 'cooldown': return btn(ids.go(ctx.owner, a.id, stamp), `${a.name} · ${timeLeft(s.readyAt.getTime() - now.getTime())}`, NAV, { disabled: true });
        // Clickable: takes you to the fix (e.g. Shop › Tools › Weapon)
        case 'needs': return btn(ids.nav(ctx.owner, 'h', s.fix), s.label, NAV);
        case 'locked': return btn(ids.go(ctx.owner, a.id, stamp), s.label, NAV, { disabled: true });
      }
    });

    const buttons = [...activityButtons];
    if (canPrestigeNow) {
      // Prestige sits with the ready activities: first when it's the suggestion, otherwise after the suggested one
      const prestigeBtn = btn(ids.nav(ctx.owner, 'h', 'prestige.confirm'), 'Prestige', suggested === 'prestige' ? SUGGESTED : MAIN, { emoji: buttonIcon('prestige') });
      buttons.splice(suggested === 'prestige' ? 0 : Math.min(1, ready.length), 0, prestigeBtn);
    }
    if (jailed) {
      const cost = bailCost(p.jailUntil!);
      buttons.unshift(btn(ids.act(ctx.owner, 'h', 'hub', 'bail'), p.wallet >= cost ? `Pay bail · ${coins(cost)}` : `Need ${coins(cost - p.wallet)} more`, MAIN, { disabled: p.wallet < cost }));
    }
    // Refresh goes at the end of the last activity row (a new row only if that one is full)
    buttons.push(btn(ids.nav(ctx.owner, 'h', 'hub'), 'Refresh', NAV));
    const rows = [];
    for (let k = 0; k < buttons.length; k += 5) rows.push(row(...buttons.slice(k, k + 5)));

    const more = [
      { label: 'Shop', value: 'shop', description: 'Tools, consumables, crates and cosmetics' },
      { label: 'Inventory', value: 'inv.all.0', description: 'Your items: use, sell or lock them' },
      { label: 'Balance', value: 'bal', description: 'Wallet, bank, deposits and withdrawals' },
      { label: 'Achievements', value: 'ach', description: 'Goals and their rewards' },
      ...(ctx.gambling !== false ? [{ label: 'Casino', value: 'casino', description: 'Games, odds and your gambling record' }] : []),
      { label: 'Wardrobe', value: 'wardrobe', description: 'Titles, badges, themes and card styles' },
      ...(unlockAt >= PRESTIGE_MENU_LEVEL || (p.account?.prestige ?? 0) > 0 ? [{ label: 'Prestige', value: 'prestige', description: 'Reset for a permanent bonus' }] : []),
      { label: 'Help', value: 'help', description: 'Every command, by category' },
    ];
    rows.push(select(ids.pick(ctx.owner, 'h', MORE), 'More…', more));
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


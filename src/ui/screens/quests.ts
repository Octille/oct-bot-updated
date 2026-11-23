import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { bar, coins, num } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { levelUpText } from '../../lib/ui';
import { questRerolls, questRewards, type QuestScope } from '../../content/quests';
import { itemName } from '../../content/items';
import { apply } from '../../services/economy';
import { unlockLevel } from '../../services/progression';
import { bonusName, claimBonus, claimQuest, nextReset, questDone, questLabel, questProgress, questSet, rerollQuest } from '../../services/quests';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { back, btn, ids, MAIN, NAV, row, select, type Payload, type ScreenCtx } from '../kit';
import { remindHour } from '../../services/reminders';
import type { ScreenModule } from './types';

function view(ctx: ScreenCtx, scope: QuestScope): Payload {
  const p = ctx.profile;
  const s = questSet(p, scope);
  const reward = questRewards[scope];
  const level = unlockLevel(p);
  const lines = s.list.map((q, i) => {
    const prog = questProgress(p, q);
    if (q.claimed) return `${icon('success')} ~~${questLabel(q)}~~`;
    if (questDone(p, q)) return `${icon('success')} **${questLabel(q)}** · ready to claim`;
    return `**${i + 1}.** ${questLabel(q)}\n-# ${bar(prog, q.target)} ${num(prog)} / ${num(q.target)}`;
  });
  const allClaimed = s.list.length > 0 && s.list.every((q) => q.claimed);
  const e = embed('economy').setTitle(`${titleIcon('quests')} Quests › ${scope === 'daily' ? 'Daily' : 'Weekly'}`).setDescription([
    ctx.note,
    `New ${scope} quests <t:${Math.floor(nextReset(scope).getTime() / 1000)}:R>.`,
    '',
    ...lines,
    '',
    `Each quest: **${coins(reward.coins(level))}** + ${reward.xp} XP · All three: **${bonusName(p, scope)}**${s.bonusClaimed ? ' (claimed)' : ''}`,
  ].filter((l) => l !== undefined).join('\n'))
    .setFooter({ text: `${questRerolls[scope] - s.rerolls} reroll left` });
  if (p.settings?.dmReminders) {
    const hour = remindHour(p.settings?.remindHour, p.streak?.lastDaily);
    const at = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 + hour * 3_600_000);
    e.addFields({ name: 'DM reminders', value: `On, at <t:${Math.floor(at.getTime() / 1000)}:t> your time${p.settings?.remindHour === null || p.settings?.remindHour === undefined ? ' (when you usually claim)' : ''}` });
  }

  const claimables = s.list.map((q, i) => ({ q, i })).filter(({ q }) => !q.claimed && questDone(p, q));
  const actions = [
    ...claimables.map(({ i }) => btn(ids.act(ctx.owner, ctx.origin, `quests.${scope}`, 'claim', i), `Claim #${i + 1} · ${coins(reward.coins(level))}`, MAIN)),
    ...(allClaimed && !s.bonusClaimed ? [btn(ids.act(ctx.owner, ctx.origin, `quests.${scope}`, 'bonus'), `Open bonus · ${itemName(reward.bonus(level))}`, MAIN)] : []),
  ];
  const components = [];
  if (actions.length) components.push(row(...actions.slice(0, 5)));
  const rerollable = s.list.map((q, i) => ({ q, i })).filter(({ q }) => !q.claimed && !questDone(p, q));
  if (s.rerolls < questRerolls[scope] && rerollable.length) {
    components.push(select(ids.act(ctx.owner, ctx.origin, `quests.${scope}`, 'reroll'), 'Reroll a quest…', rerollable.map(({ q, i }) => ({
      label: `#${i + 1} ${questLabel(q)}`, value: String(i), description: 'Swap it for a different quest',
    }))));
  }
  components.push(row(
    back(ctx, null),
    btn(ids.nav(ctx.owner, ctx.origin, `quests.${scope === 'daily' ? 'weekly' : 'daily'}`), scope === 'daily' ? 'Weekly quests' : 'Daily quests', NAV),
    btn(ids.act(ctx.owner, ctx.origin, `quests.${scope}`, 'remind'), p.settings?.dmReminders ? 'Turn off reminders' : 'DM me reminders', NAV),
    ...(p.settings?.dmReminders ? [btn(ids.act(ctx.owner, ctx.origin, `quests.${scope}`, 'hour'), 'Remind me at…', NAV)] : []),
  ));
  return { embeds: [e], components };
}

/** quests.daily · quests.weekly */
export const questsScreen: ScreenModule = {
  render(path, ctx) {
    return view(ctx, path[1] === 'weekly' ? 'weekly' : 'daily');
  },

  async act(path, action, args, interaction, ctx) {
    const scope: QuestScope = path[1] === 'weekly' ? 'weekly' : 'daily';
    const here = `quests.${scope}`;
    try {
      switch (action) {
        case 'claim': {
          const r = await claimQuest(ctx.owner, scope, Number(args[0]));
          return { path: here, note: [`${icon('success')} Quest complete: **+${coins(r.coins)}** and ${r.xp} XP.`, levelUpText(r.levelUp)].filter(Boolean).join('\n') };
        }
        case 'bonus': {
          const r = await claimBonus(ctx.owner, scope);
          return { path: here, note: `${icon('success')} You got a **${itemName(r.item!)}**. Open it from your inventory.` };
        }
        case 'reroll': {
          if (!interaction.isStringSelectMenu()) return { path: here };
          const q = await rerollQuest(ctx.owner, scope, Number(interaction.values[0]));
          return { path: here, note: `${icon('success')} New quest: **${questLabel(q)}**.` };
        }
        case 'hour': {
          if (!interaction.isButton()) return { path: here };
          const input = new TextInputBuilder().setCustomId('hour').setLabel('Hour in UTC (0–23), or "auto"').setPlaceholder(`Now it's ${new Date().getUTCHours()}:00 UTC`)
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5);
          await interaction.showModal(new ModalBuilder().setCustomId(ids.act(ctx.owner, ctx.origin, here, 'hoursub')).setTitle('Remind me at…')
            .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
          return { handled: true };
        }
        case 'hoursub': {
          if (!interaction.isModalSubmit()) return { path: here };
          const raw = interaction.fields.getTextInputValue('hour').trim().toLowerCase().replace(/:00$/, '');
          const hour = raw === 'auto' ? null : Number(raw);
          if (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) throw new UserError('Enter a whole hour from 0 to 23 (UTC), or "auto".');
          await apply(ctx.owner, { set: { 'settings.remindHour': hour } }, { source: 'settings' });
          if (hour === null) return { path: here, note: `${icon('success')} Reminders will come around when you usually claim your daily.` };
          const at = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 + hour * 3_600_000);
          return { path: here, note: `${icon('success')} Reminders will come at <t:${Math.floor(at.getTime() / 1000)}:t> your time.` };
        }
        case 'remind': {
          const on = !ctx.profile.settings?.dmReminders;
          await apply(ctx.owner, { set: { 'settings.dmReminders': on } }, { source: 'settings' });
          return { path: here, note: on ? `${icon('success')} I'll DM you when your daily or weekly is ready and you haven't claimed it. Make sure your DMs are open.` : 'Reminders off.' };
        }
      }
    } catch (err) {
      if (err instanceof UserError) return { path: here, note: `${icon('error')} ${err.message}` };
      throw err;
    }
    return { path: here };
  },
};

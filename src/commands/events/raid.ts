import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { bosses, goalRules, goalTypes, raidRules } from '../../content/events';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { bar, coins, num } from '../../lib/format';
import { buttonIcon, icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button } from '../../lib/ui';
import { attackRaid, currentGoal, currentRaid } from '../../services/raids';
import { btn, ids, NAV, row } from '../../ui/kit';

export default defineCommand({
  data: new SlashCommandBuilder().setName('raid').setDescription("This week's boss raid and community goal"),
  category: 'events',
  guildOnly: true,
  defer: 'public',
  async execute({ interaction }) {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    let note: string | null = null;

    const render = async () => {
      const now = new Date();
      const [raid, goal] = await Promise.all([currentRaid(guildId, now), currentGoal(guildId, now)]);
      if (!raid && !goal) {
        throw new UserError('No raid or goal this week. A server admin can turn them on with `/settings` (Events) (they start every Monday).');
      }
      const lines: string[] = [];
      if (note) lines.push(note, '');
      let canAttack = false;
      if (raid) {
        const boss = bosses.find((b) => b.id === raid.bossId)!;
        const dmg = (raid.damage ?? {}) as Record<string, number>;
        const top = Object.entries(dmg).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const mine = dmg[userId] ?? 0;
        canAttack = raid.status === 'active' && raid.endsAt > now;
        lines.push(
          `${boss.emoji} **${boss.name}** · ${boss.line}`,
          raid.status === 'defeated' ? (raid.rewarded ? `${icon('success')} **Defeated!** Rewards were paid to everyone who fought.` : `${icon('warning')} **Defeated**, but fewer than ${raidRules.minHitters} different players fought it, so no rewards.`)
            : raid.status === 'escaped' || raid.endsAt <= now ? `${icon('warning')} It got away this time.`
            : `HP ${bar(raid.hp, raid.maxHp)} ${num(Math.max(0, raid.hp))} / ${num(raid.maxHp)} · escapes <t:${Math.floor(raid.endsAt.getTime() / 1000)}:R>`,
          `Your damage: **${num(mine)}**${top.length ? ` · Top: ${top.map(([id, d], i) => `${i + 1}. <@${id}> ${num(d)}`).join(', ')}` : ''}`,
          `-# Win (with ${raidRules.minHitters}+ different fighters): everyone gets ${coins(raidRules.reward.base)} + a share of ${coins(raidRules.reward.perShare)} by damage, and a crate (top 3 better, the MVP best). One raid reward a week.`,
        );
      }
      if (goal) {
        const type = goalTypes.find((g) => g.metric === goal.metric)!;
        const mine = ((goal.contributors ?? {}) as Record<string, number>)[userId] ?? 0;
        lines.push(
          '',
          `${titleIcon('goal')} **Community goal:** ${type.label.replace('{n}', num(goal.target))}`,
          goal.status === 'done' ? `${icon('success')} **Done!** Everyone with ${goalRules.minContribution}+ got ${coins(goalRules.reward.coins)} and a crate.`
            : goal.status === 'failed' ? `${icon('warning')} Not reached this week.`
            : `${bar(goal.progress, goal.target)} ${num(goal.progress)} / ${num(goal.target)} · ends <t:${Math.floor(goal.endsAt.getTime() / 1000)}:R>`,
          `Your part: **${num(mine)}**${mine < goalRules.minContribution ? ` (${goalRules.minContribution} needed to share the reward)` : ''}`,
        );
      }
      return {
        embeds: [embed('events').setTitle(`${titleIcon('raid')} Raid`).setDescription(lines.join('\n'))],
        components: [row(
          btn(ids.go(userId, 'menu'), 'Menu', NAV),
          ...(canAttack ? [button('~raid', userId, ['attack'], 'Attack', ButtonStyle.Success, buttonIcon('raid'))] : []),
        )],
        allowedMentions: { parse: [] as [] },
      };
    };

    const message = await interaction.editReply(await render());
    const collector = collect(message, { time: 10 * 60_000, idle: 3 * 60_000, disableOnEnd: false });
    collector.on('collect', (i) => {
      // Only the Attack button; Menu is a normal button handled elsewhere
      if (!i.customId.startsWith('~raid:')) return;
      (async () => {
        await i.deferUpdate();
        try {
          const r = await attackRaid(guildId, userId);
          note = r.defeated
            ? `${icon('success')} You hit for **${num(r.damage)}** and landed the final blow! Rewards are on their way to everyone.`
            : `${icon('success')} You hit for **${num(r.damage)}**. Attack again in ${raidRules.attackCooldownMinutes}m. (+${raidRules.seasonPointsPerAttack} season points)`;
        } catch (err) {
          if (!(err instanceof UserError)) throw err;
          note = `${icon('error')} ${err.message}`;
        }
        await interaction.editReply(await render());
      })().catch((err) => logError('raid', err));
    });
  },
});

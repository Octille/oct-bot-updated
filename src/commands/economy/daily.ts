import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, relative } from '../../lib/format';
import { UserError, EconomyError } from '../../lib/errors';
import { levelUpText } from '../../lib/ui';
import { daily } from '../../content/earning';
import { claimDaily, streakCalendar } from '../../game/streaks';
import { grant, incomeMultiplier } from '../../services/progression';

export default defineCommand({
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily reward (resets at 00:00 UTC)'),
  category: 'economy',
  blockedInJail: true,
  async execute({ interaction, profile }) {
    const now = new Date();
    const state = {
      count: profile.streak?.count ?? 0,
      best: profile.streak?.best ?? 0,
      lastDaily: profile.streak?.lastDaily ?? null,
      days: profile.streak?.days ?? [],
    };
    const result = claimDaily(state, now, incomeMultiplier(profile));
    if (!result.ok) throw new UserError(`You've already claimed today's daily. Next one ${relative(result.nextAt)}.`);

    let granted;
    try {
      granted = await grant(interaction.user.id, {
        wallet: result.coins + result.milestoneBonus,
        set: { 'streak.count': result.streak, 'streak.best': result.best, 'streak.lastDaily': now, 'streak.days': result.days },
        // Only succeeds if nobody claimed since we read the profile
        where: { 'streak.lastDaily': state.lastDaily },
      }, { source: 'daily', xp: 'daily', meta: { streak: result.streak } });
    } catch (err) {
      if (err instanceof EconomyError && err.code === 'CONFLICT') throw new UserError("You've already claimed today's daily.");
      throw err;
    }

    const nextTier = daily.multipliers.slice().reverse().find(([min]) => min > result.streak);
    const lines = [
      `☀️ **+${coins(result.coins)}**${result.multiplier > 1 ? ` (${result.multiplier}× streak bonus)` : ''}`,
      result.milestoneBonus ? `🏆 **${result.streak}-day milestone!** +${coins(result.milestoneBonus)}` : null,
      result.broken ? `💔 Your streak reset. It was ${state.count} days.` : null,
      `🔥 Streak: **${result.streak}** day${result.streak === 1 ? '' : 's'}${nextTier ? ` — ${nextTier[0] - result.streak} more for ${nextTier[1]}×` : ''}`,
      levelUpText(granted.levelUp),
    ].filter(Boolean);

    await interaction.reply({ embeds: [embed('economy')
      .setTitle('Daily reward')
      .setDescription(lines.join('\n'))
      .addFields({ name: 'Last two weeks', value: streakCalendar(result.days, now) })
      .setFooter({ text: `+${granted.xp} XP • Resets at 00:00 UTC` })] });
  },
});

import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { relative } from '../../lib/format';
import { daily, dailyMultiplier } from '../../content/earning';
import { dayNumber, nextUtcMidnight, streakCalendar } from '../../game/streaks';

export default defineCommand({
  data: new SlashCommandBuilder().setName('streak').setDescription('See your daily streak calendar'),
  category: 'economy',
  async execute({ interaction, profile }) {
    const now = new Date();
    const s = profile.streak;
    const today = dayNumber(now);
    const last = s?.lastDaily ? dayNumber(s.lastDaily) : null;
    // A streak only counts if it was claimed today or yesterday
    const alive = last !== null && today - last <= 1;
    const current = alive ? s?.count ?? 0 : 0;
    const status = last === today
      ? `✅ Claimed today. Next daily ${relative(nextUtcMidnight(now))}.`
      : alive ? '⏰ Not claimed yet today — `/daily` before 00:00 UTC to keep it!' : '`/daily` to start a streak.';
    const milestones = Object.keys(daily.milestones).map(Number).filter((m) => m > current).slice(0, 3);

    await interaction.reply({ embeds: [embed('economy')
      .setTitle(`🔥 ${interaction.user.username}'s streak`)
      .setDescription(status)
      .addFields(
        { name: 'Current', value: `${current} day${current === 1 ? '' : 's'} (${dailyMultiplier(current)}×)`, inline: true },
        { name: 'Best', value: `${s?.best ?? 0} days`, inline: true },
        { name: 'Next milestones', value: milestones.map((m) => `${m} days`).join(' • ') || 'All done!', inline: true },
        { name: 'Last two weeks', value: streakCalendar(s?.days ?? [], now) },
      )] });
  },
});

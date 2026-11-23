import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, relative } from '../../lib/format';
import { EconomyError, UserError } from '../../lib/errors';
import { levelUpText } from '../../lib/ui';
import { claimWeekly } from '../../game/streaks';
import { grant, incomeMultiplier } from '../../services/progression';

export default defineCommand({
  data: new SlashCommandBuilder().setName('weekly').setDescription('Claim your weekly reward'),
  category: 'economy',
  blockedInJail: true,
  async execute({ interaction, profile }) {
    const now = new Date();
    const last = profile.streak?.lastWeekly ?? null;
    const result = claimWeekly({ weeklyCount: profile.streak?.weeklyCount ?? 0, lastWeekly: last }, now, incomeMultiplier(profile));
    if (!result.ok) throw new UserError(`Your weekly is ready ${relative(result.nextAt)}.`);

    let granted;
    try {
      granted = await grant(interaction.user.id, {
        wallet: result.coins,
        set: { 'streak.weeklyCount': result.streak, 'streak.lastWeekly': now },
        where: { 'streak.lastWeekly': last },
      }, { source: 'weekly', xp: 'weekly', profile });
    } catch (err) {
      if (err instanceof EconomyError && err.code === 'CONFLICT') throw new UserError("You've already claimed this week's reward.");
      throw err;
    }

    const lines = [
      `📦 **+${coins(result.coins)}**${result.multiplier > 1 ? ` (${result.multiplier.toFixed(1)}× for ${result.streak} weeks in a row)` : ''}`,
      `Next one ${relative(now.getTime() + 7 * 86_400_000)} — claim within a week of that to keep the bonus growing.`,
      levelUpText(granted.levelUp),
    ].filter(Boolean);
    await interaction.reply({ embeds: [embed('economy').setTitle('Weekly reward').setDescription(lines.join('\n')).setFooter({ text: `+${granted.xp} XP` })] });
  },
});

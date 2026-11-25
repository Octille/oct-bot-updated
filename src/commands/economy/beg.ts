import { icon, titleIcon } from '../../lib/icons';
import { afterAction } from '../../ui/next';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { levelUpText } from '../../lib/ui';
import { cooldowns } from '../../content/earning';
import { rollBeg } from '../../game/begSearch';
import { grant, incomeMultiplier } from '../../services/progression';

export default defineCommand({
  data: new SlashCommandBuilder().setName('beg').setDescription('Beg strangers for spare Octs'),
  category: 'economy',
  blockedInJail: true,
  cooldown: { key: 'beg', seconds: cooldowns.beg },
  async execute({ interaction, profile }) {
    const result = rollBeg(incomeMultiplier(profile));
    const { xp, levelUp } = await grant(interaction.user.id, {
      wallet: result.kind === 'nothing' ? undefined : result.coins,
      inc: { 'stats.begged': 1 },
    }, { source: 'beg', xp: 'beg', guildId: interaction.guildId, profile });

    const text = result.kind === 'nothing'
      ? result.line
      : `${icon('success')} ${result.line} **${coins(result.coins)}**.`;
    const next = await afterAction(interaction.user.id, 'beg');
    await interaction.reply({ embeds: [embed(result.kind === 'nothing' ? 'warning' : 'success')
      .setTitle(`${titleIcon('beg')} Beg`)
      .setDescription([text, levelUpText(levelUp), next.note].filter(Boolean).join('\n'))
      .setFooter({ text: `+${xp} XP` })], components: [next.row] });
  },
});

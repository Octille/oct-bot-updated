import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { cooldowns } from '../../content/earning';
import { itemLabel } from '../../content/items';
import { rollSearch, rollSpots } from '../../game/begSearch';
import { getProfile } from '../../services/economy';
import { grant, incomeMultiplier } from '../../services/progression';
import * as cooldownService from '../../services/cooldowns';

export default defineCommand({
  data: new SlashCommandBuilder().setName('search').setDescription('Search one of three spots for loot'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'search', seconds: cooldowns.search },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const spots = rollSpots();
    const message = await interaction.editReply({
      embeds: [embed('economy').setTitle('🔍 Where do you search?').setDescription('Most spots have something. Some have... consequences.')],
      components: rows(spots.map((s, i) => button('~search', userId, [i], s.name, ButtonStyle.Secondary, s.emoji))),
    });

    let chosen = false;
    const collector = collect(message, { time: 30_000, max: 1, disableOnEnd: false });
    collector.on('collect', (i) => {
      chosen = true;
      (async () => {
        const spot = spots[Number(parseId(i.customId).args[0])]!;
        const result = rollSearch(incomeMultiplier(profile));
        let text: string;
        let change = {};
        if (result.kind === 'coins') {
          change = { wallet: result.coins };
          text = `You searched the **${spot.name}** and found **${coins(result.coins)}**!`;
        } else if (result.kind === 'item') {
          change = { items: { [result.itemId]: 1 } };
          text = `You searched the **${spot.name}** and found a **${itemLabel(result.itemId)}**!`;
        } else if (result.kind === 'mishap') {
          // Can't lose more than you're carrying
          const wallet = (await getProfile(userId)).wallet;
          const loss = Math.min(result.loss, wallet);
          change = loss > 0 ? { wallet: -loss } : {};
          text = loss > 0 ? `${spot.emoji} ${result.line} **${coins(loss)}**.` : `${spot.emoji} ${result.line}... nothing, because your wallet is empty. Lucky?`;
        } else {
          text = `${spot.emoji} **${spot.name}**: ${result.line}`;
        }

        const { xp, levelUp } = await grant(userId, { ...change, inc: { 'stats.searched': 1 } }, { source: 'search', xp: 'search', profile, meta: { spot: spot.name, outcome: result.kind } });
        await i.update({
          embeds: [embed(result.kind === 'mishap' ? 'warning' : 'economy').setTitle(`${spot.emoji} ${spot.name}`)
            .setDescription([text, levelUpText(levelUp)].filter(Boolean).join('\n')).setFooter({ text: `+${xp} XP` })],
          components: rows(spots.map((s, n) => button('~search', userId, [n], s.name, s === spot ? ButtonStyle.Primary : ButtonStyle.Secondary, s.emoji, true))),
        });
      })().catch((err) => logError('search', err));
    });
    collector.on('end', () => {
      if (chosen) return;
      cooldownService.release(userId, 'search').catch(() => undefined);
      interaction.editReply({ content: '⌛ You wandered off. Cooldown refunded.', embeds: [], components: [] }).catch(() => undefined);
    });
  },
});

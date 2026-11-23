import { icon, titleIcon } from '../../lib/icons';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { titled } from '../../lib/theme';
import { getItem } from '../../content/items';
import { rarities, rarityInfo } from '../../content/rarity';
import { getProfile } from '../../services/economy';
import { inventoryOf, inventoryValue } from '../../services/items';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Your items: use, sell or lock them')
    .addUserOption((o) => o.setName('user').setDescription("Look at someone else's items")),
  category: 'economy',
  async execute({ interaction, profile }) {
    const target = interaction.options.getUser('user');
    if (!target || target.id === interaction.user.id) return replyWithScreen(interaction, 'inv.all.0', profile);

    // Someone else's inventory: read-only, top 20 by rarity
    const other = await getProfile(target.id);
    const list = Object.entries(inventoryOf(other))
      .map(([id, qty]) => ({ qty, item: getItem(id) }))
      .filter((e) => e.qty > 0 && e.item)
      .sort((a, b) => rarities.indexOf(b.item!.rarity) - rarities.indexOf(a.item!.rarity))
      .slice(0, 20);
    await interaction.reply({ embeds: [embed('economy')
      .setTitle(`${titleIcon('inventory')} ${titled(target.globalName ?? target.username, other)}'s inventory`)
      .setDescription(list.map(({ qty, item }) => `${icon(item!.rarity)} ${item!.name} ×${num(qty)}`).join('\n') || 'Empty.')
      .setFooter({ text: `Total value ${coins(inventoryValue(inventoryOf(other)))}` })] });
  },
});

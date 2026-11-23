import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed, successEmbed } from '../../lib/embeds';
import { coins, num, relative } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { consumableUses } from '../../content/consumables';
import { getItem, itemLabel } from '../../content/items';
import { rarities, rarityInfo } from '../../content/rarity';
import { getProfile } from '../../services/economy';
import { inventoryOf, itemChoices, useItem } from '../../services/items';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lootLines(coinsWon: number, loot: Record<string, number>): string {
  const lines = Object.entries(loot)
    .sort(([a], [b]) => rarities.indexOf(getItem(b)?.rarity ?? 'common') - rarities.indexOf(getItem(a)?.rarity ?? 'common'))
    .map(([id, q]) => `${rarityInfo[getItem(id)?.rarity ?? 'common'].emoji} ${itemLabel(id, q)}`);
  if (coinsWon) lines.unshift(`🪙 **${coins(coinsWon)}**`);
  return lines.join('\n');
}

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use a consumable or open a crate')
    .addStringOption((o) => o.setName('item').setDescription('What to use').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many (default 1)').setMinValue(1).setMaxValue(25)),
  category: 'economy',
  defer: 'public',
  async autocomplete(interaction) {
    const owned = inventoryOf(await getProfile(interaction.user.id));
    await interaction.respond(itemChoices(interaction.options.getFocused(), (id) => (owned[id] ?? 0) > 0 && !!consumableUses[id]));
  },
  async execute({ interaction }) {
    const id = interaction.options.getString('item', true);
    const qty = interaction.options.getInteger('amount') ?? 1;
    const item = getItem(id);
    if (!item) throw new UserError("I don't know that item.");
    const result = await useItem(interaction.user.id, id, qty);

    switch (result.kind) {
      case 'boost':
        return interaction.editReply({ embeds: [successEmbed(`${result.label} active until ${relative(result.until)}.`)] });
      case 'bank_note':
        return interaction.editReply({ embeds: [successEmbed(`🏦 Used ${num(result.qty)} bank note${result.qty > 1 ? 's' : ''}. Your bank holds **+${coins(result.newCapacityBonus)}** extra in total now.`)] });
      case 'scratch': {
        const shown = result.prizes.map((p) => (p ? `🎉 ${coins(p)}` : '❌')).join(' • ');
        return interaction.editReply({ embeds: [embed('gambling').setTitle(`🎟️ Scratched ${result.qty} card${result.qty > 1 ? 's' : ''}`)
          .setDescription(`${shown}\n\nTotal: **${coins(result.total)}**`)] });
      }
      case 'crate': {
        const info = rarityInfo[item.rarity];
        if (result.qty === 1) {
          // A short "spinning" reveal
          const spin = ['⚪', '🟢', '🔵', '🟣', '🟠', '🔴'];
          for (let step = 0; step < 3; step++) {
            const reel = Array.from({ length: 5 }, (_, k) => spin[(step * 2 + k) % spin.length]).join(' ');
            await interaction.editReply({ embeds: [embed('economy').setColor(info.color).setTitle(`${item.emoji} Opening ${item.name}...`).setDescription(`# ${reel}`)] });
            await sleep(650);
          }
        }
        return interaction.editReply({ embeds: [embed('economy').setColor(info.color)
          .setTitle(`${item.emoji} ${result.qty > 1 ? `${result.qty}× ${item.name}` : item.name} opened!`)
          .setDescription(lootLines(result.loot.coins, result.loot.items))] });
      }
    }
  },
});

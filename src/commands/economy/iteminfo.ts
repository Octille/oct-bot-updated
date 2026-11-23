import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { getItem } from '../../content/items';
import { rarityInfo } from '../../content/rarity';
import { basics } from '../../content/shop';
import { consumableUses } from '../../content/consumables';
import { getCrate } from '../../content/crates';
import { expectedCrateValue } from '../../game/crates';
import { inventoryOf, itemChoices } from '../../services/items';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('iteminfo')
    .setDescription('Details about an item')
    .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true).setAutocomplete(true)),
  category: 'economy',
  async autocomplete(interaction) {
    await interaction.respond(itemChoices(interaction.options.getFocused()));
  },
  async execute({ interaction, profile }) {
    const id = interaction.options.getString('item', true);
    const item = getItem(id);
    if (!item) throw new UserError("I don't know that item.");
    const info = rarityInfo[item.rarity];
    const shop = basics.find((b) => b.id === id);
    const crate = getCrate(id);
    const e = embed('economy')
      .setColor(info.color)
      .setTitle(`${item.emoji} ${item.name}`)
      .setDescription(item.description)
      .addFields(
        { name: 'Rarity', value: `${info.emoji} ${info.label}`, inline: true },
        { name: 'Type', value: item.type, inline: true },
        { name: 'Sells for', value: coins(item.sellPrice), inline: true },
        { name: 'You own', value: num(inventoryOf(profile)[id] ?? 0), inline: true },
      );
    if (shop) e.addFields({ name: 'Shop price', value: coins(shop.price), inline: true });
    if (consumableUses[id]) e.addFields({ name: 'Use', value: `\`/use item:${item.name}\``, inline: true });
    if (crate) e.addFields({ name: 'Average contents', value: `≈ ${coins(expectedCrateValue(crate))} over ${crate.rolls} rolls`, inline: true });
    await interaction.reply({ embeds: [e] });
  },
});

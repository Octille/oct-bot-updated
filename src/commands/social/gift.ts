import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { itemLabel } from '../../content/items';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { itemChoices, inventoryOf } from '../../services/items';
import { getProfile } from '../../services/economy';
import { findItem, giftItem } from '../../services/trade';

export default defineCommand({
  data: new SlashCommandBuilder().setName('gift').setDescription('Give items to another player')
    .addUserOption((o) => o.setName('user').setDescription('Who to gift').setRequired(true))
    .addStringOption((o) => o.setName('item').setDescription('Item').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('quantity').setDescription('How many (default 1)').setMinValue(1).setMaxValue(1000)),
  category: 'social',
  guildOnly: true,
  async execute({ interaction }) {
    const target = interaction.options.getUser('user', true);
    if (target.bot) throw new UserError("Bots don't need gifts.");
    const item = findItem(interaction.options.getString('item', true));
    if (!item) throw new UserError("I don't know that item.");
    const qty = interaction.options.getInteger('quantity') ?? 1;
    await giftItem(interaction.user.id, target.id, item.id, qty);
    await interaction.reply({
      embeds: [embed('success').setTitle(`${titleIcon('give')} Gift`).setDescription(`${icon('success')} <@${interaction.user.id}> gave <@${target.id}> **${itemLabel(item.id, qty)}**.`)],
      allowedMentions: { users: [target.id] },
    });
  },
  async autocomplete(interaction) {
    const p = await getProfile(interaction.user.id);
    const inv = inventoryOf(p);
    await interaction.respond(itemChoices(String(interaction.options.getFocused()), (id) => (inv[id] ?? 0) > 0));
  },
});

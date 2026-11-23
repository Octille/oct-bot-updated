import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { UserError } from '../../lib/errors';
import { consumableUses } from '../../content/consumables';
import { getItem } from '../../content/items';
import { getProfile } from '../../services/economy';
import { inventoryOf, itemChoices, useItem } from '../../services/items';
import { describeUse } from '../../ui/screens/useResult';
import { replyWithScreen } from '../../ui/open';

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
    if (!getItem(id)) throw new UserError("I don't know that item.");
    const result = await useItem(interaction.user.id, id, interaction.options.getInteger('amount') ?? 1);
    // The item screen shows what happened, with Open/Use again, Sell and Back to inventory
    await replyWithScreen(interaction, `inv.item.${id}.all.0`, await getProfile(interaction.user.id), describeUse(result));
  },
});

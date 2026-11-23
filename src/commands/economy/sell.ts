import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed, successEmbed, warningEmbed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { parseAmount } from '../../lib/amount';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { getItem, itemLabel } from '../../content/items';
import { rarities, rarityInfo, type Rarity } from '../../content/rarity';
import { inventoryOf, itemChoices, selectForSale, sell, describeSale, type BulkFilter } from '../../services/items';
import { getProfile } from '../../services/economy';

const BULK = [
  { name: 'All fish', value: 'type:fish' },
  { name: 'All materials & trophies', value: 'type:material' },
  { name: 'All collectibles & treasure', value: 'type:collectible' },
  ...rarities.map((r) => ({ name: `Everything ${rarityInfo[r].label}`, value: `rarity:${r}` })),
  { name: 'Everything sellable (not consumables or crates)', value: 'everything' },
];

function parseBulk(value: string): BulkFilter {
  if (value === 'everything') return { everything: true };
  const [kind, v] = value.split(':');
  return kind === 'type' ? { type: v as never } : { rarity: v as Rarity };
}

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell items for Octs')
    .addSubcommand((s) => s.setName('item').setDescription('Sell one kind of item')
      .addStringOption((o) => o.setName('item').setDescription('What to sell').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('amount').setDescription('How many: 3, half, all (default all)')))
    .addSubcommand((s) => s.setName('bulk').setDescription('Sell a whole category or rarity at once')
      .addStringOption((o) => o.setName('what').setDescription('What to sell').setRequired(true).addChoices(...BULK))),
  category: 'economy',
  async autocomplete(interaction) {
    const owned = inventoryOf(await getProfile(interaction.user.id));
    await interaction.respond(itemChoices(interaction.options.getFocused(), (id) => (owned[id] ?? 0) > 0 && (getItem(id)?.sellPrice ?? 0) > 0));
  },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const inventory = inventoryOf(profile);

    if (interaction.options.getSubcommand() === 'item') {
      const id = interaction.options.getString('item', true);
      const owned = inventory[id] ?? 0;
      if (!getItem(id)) throw new UserError("I don't know that item.");
      if (owned <= 0) throw new UserError(`You don't have any ${itemLabel(id)}.`);
      const parsed = parseAmount(interaction.options.getString('amount') ?? 'all', owned);
      if (!parsed.ok) throw new UserError(parsed.reason);
      const sale = await sell(userId, { [id]: parsed.value });
      return interaction.reply({ embeds: [successEmbed(`Sold ${itemLabel(id, parsed.value)} for **${coins(sale.total)}**.`)] });
    }

    const selected = selectForSale(inventory, parseBulk(interaction.options.getString('what', true)));
    if (!Object.keys(selected).length) throw new UserError('You have nothing in that category to sell.');
    const total = Object.entries(selected).reduce((s, [id, q]) => s + (getItem(id)?.sellPrice ?? 0) * q, 0);

    const response = await interaction.reply({
      embeds: [embed('economy').setTitle(`Sell for ${coins(total)}?`).setDescription(describeSale({ items: selected, total }))],
      components: rows([
        button('~sell', userId, ['yes'], `Sell for ${coins(total)}`, ButtonStyle.Success, '💰'),
        button('~sell', userId, ['no'], 'Cancel', ButtonStyle.Secondary),
      ]),
      withResponse: true,
    });
    const message = response.resource?.message;
    if (!message) return;
    collect(message, { time: 30_000, max: 1 }).on('collect', (i) => {
      (async () => {
        if (parseId(i.customId).args[0] !== 'yes') return i.update({ embeds: [warningEmbed('Sale cancelled.')], components: [] });
        try {
          const sale = await sell(userId, selected);
          await i.update({ embeds: [successEmbed(`Sold everything for **${coins(sale.total)}**.`).addFields({ name: 'Sold', value: describeSale(sale) })], components: [] });
        } catch (err) {
          if (!(err instanceof UserError)) throw err;
          await i.update({ embeds: [warningEmbed(`${err.message} Your inventory changed — run /sell again.`)], components: [] });
        }
      })().catch((err) => logError('sell', err));
    });
  },
});

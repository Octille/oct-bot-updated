import { icon } from '../../lib/icons';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { coins } from '../../lib/format';
import { parseAmount } from '../../lib/amount';
import { UserError } from '../../lib/errors';
import { getItem, itemLabel } from '../../content/items';
import { rarities, rarityInfo } from '../../content/rarity';
import { getProfile } from '../../services/economy';
import { inventoryOf, itemChoices, RARE_FROM, sell } from '../../services/items';
import { replyWithScreen } from '../../ui/open';

const BULK = [
  { name: 'All fish', value: 'fish' },
  { name: 'All materials & trophies', value: 'material' },
  { name: 'All collectibles & treasure', value: 'collectible' },
  ...rarities.map((r) => ({ name: `Everything ${rarityInfo[r].label}`, value: `r-${r}` })),
  { name: 'Everything sellable (not consumables or crates)', value: 'all' },
];

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
    if (interaction.options.getSubcommand() === 'bulk') {
      const code = interaction.options.getString('what', true);
      // Asking for an Epic+ rarity by name means you want to sell those, so include them
      const rare = code.startsWith('r-') && rarities.indexOf(code.slice(2) as never) >= rarities.indexOf(RARE_FROM) ? 1 : 0;
      return replyWithScreen(interaction, `inv.sell.${code}.${rare}.all`, profile);
    }

    const id = interaction.options.getString('item', true);
    const owned = inventoryOf(profile)[id] ?? 0;
    if (!getItem(id)) throw new UserError("I don't know that item.");
    if (owned <= 0) throw new UserError(`You don't have any ${itemLabel(id)}.`);
    const amount = interaction.options.getString('amount') ?? 'all';
    // "Sell all" always confirms first
    if (['all', 'max'].includes(amount.trim().toLowerCase()) && owned > 1) {
      return replyWithScreen(interaction, `inv.sellitem.${id}.all.0`, profile);
    }
    const parsed = parseAmount(amount, owned);
    if (!parsed.ok) throw new UserError(parsed.reason);
    const sale = await sell(interaction.user.id, { [id]: parsed.value });
    await replyWithScreen(interaction, `inv.item.${id}.all.0`, sale.profile, `${icon('success')} Sold ${itemLabel(id, parsed.value)} for **${coins(sale.total)}**. Wallet ${coins(sale.profile.wallet)}`);
  },
});

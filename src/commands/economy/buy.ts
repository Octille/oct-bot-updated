import { icon } from '../../lib/icons';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { coins } from '../../lib/format';
import { basics } from '../../content/shop';
import { cosmetics } from '../../content/cosmetics';
import { buy, displayName, findEntry, getRotation } from '../../services/shop';
import { replyWithScreen } from '../../ui/open';
import { getItem } from '../../content/items';

/** Which shop section an item lives in, so the result screen has the right Back. */
function sectionOf(id: string): string {
  if (cosmetics.some((c) => c.id === id)) return getRotation().stock.some((s) => s.id === id) ? 'deals' : 'cos';
  if (getRotation().stock.some((s) => s.id === id)) return getItem(id)?.type === 'crate' ? 'crates' : 'deals';
  return getItem(id)?.type === 'crate' ? 'crates' : 'cons';
}

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy from the shop')
    .addStringOption((o) => o.setName('item').setDescription('What to buy').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many (default 1)').setMinValue(1).setMaxValue(100)),
  category: 'economy',
  async autocomplete(interaction) {
    const q = interaction.options.getFocused().toLowerCase();
    const { stock } = getRotation();
    const all = [
      ...basics,
      ...stock,
      ...cosmetics.filter((c) => !c.rotationOnly).map((c) => ({ id: c.id, kind: 'cosmetic' as const, price: c.price })),
    ];
    await interaction.respond(all
      .map((e) => ({ name: `${displayName(e).replace(/^\S+ /, '')} — ${coins(e.price)}`.slice(0, 100), value: e.id }))
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 25));
  },
  async execute({ interaction }) {
    const id = interaction.options.getString('item', true);
    const p = await buy(interaction.user.id, id, interaction.options.getInteger('amount') ?? 1);
    const where = findEntry(id) ? `shop.item.${id}.${sectionOf(id)}` : 'shop';
    await replyWithScreen(interaction, where, p.profile, `${icon('success')} Bought ${p.qty > 1 ? `${p.qty}× ` : ''}**${p.label}** for ${coins(p.total)}. Wallet ${coins(p.profile.wallet)}`);
  },
});

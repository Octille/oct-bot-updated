import { ActionRowBuilder, ButtonStyle, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { collect } from '../../lib/collect';
import { makeId, parseId } from '../../lib/customId';
import { button, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { themeColor, titled } from '../../lib/theme';
import { getItem, type ItemType } from '../../content/items';
import { rarities, rarityInfo } from '../../content/rarity';
import { getProfile, type Profile } from '../../services/economy';
import { inventoryOf, inventoryValue } from '../../services/items';

const PAGE = 10;
const FILTERS: { value: 'all' | ItemType; label: string; emoji: string }[] = [
  { value: 'all', label: 'Everything', emoji: '🎒' },
  { value: 'fish', label: 'Fish', emoji: '🐟' },
  { value: 'material', label: 'Materials & trophies', emoji: '🪨' },
  { value: 'collectible', label: 'Collectibles & treasure', emoji: '🏺' },
  { value: 'consumable', label: 'Consumables', emoji: '🧪' },
  { value: 'crate', label: 'Crates', emoji: '📦' },
];

function entries(profile: Profile, filter: 'all' | ItemType) {
  return Object.entries(inventoryOf(profile))
    .map(([id, qty]) => ({ id, qty, item: getItem(id) }))
    .filter((e) => e.qty > 0 && e.item && (filter === 'all' || e.item.type === filter))
    .sort((a, b) => rarities.indexOf(b.item!.rarity) - rarities.indexOf(a.item!.rarity) || a.item!.name.localeCompare(b.item!.name));
}

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Your items')
    .addUserOption((o) => o.setName('user').setDescription("Someone else's inventory")),
  category: 'economy',
  async execute({ interaction, profile }) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const viewer = interaction.user.id;
    let data = target.id === viewer ? profile : await getProfile(target.id);
    let filter: 'all' | ItemType = 'all';
    let page = 0;

    const render = () => {
      const list = entries(data, filter);
      const pages = Math.max(1, Math.ceil(list.length / PAGE));
      page = Math.min(page, pages - 1);
      const slice = list.slice(page * PAGE, page * PAGE + PAGE);
      const e = embed('economy')
        .setAuthor({ name: `${titled(target.username, data)}'s inventory`, iconURL: target.displayAvatarURL() })
        .setDescription(slice.length
          ? slice.map(({ item, qty }) => `${rarityInfo[item!.rarity].emoji} ${item!.emoji} **${item!.name}** ×${num(qty)} — ${coins(item!.sellPrice * qty)}`).join('\n')
          : 'Nothing here yet. Go `/fish`, `/mine`, `/hunt` or `/dig`!')
        .setFooter({ text: `Page ${page + 1}/${pages} • Total value ${coins(inventoryValue(inventoryOf(data)))} • /sell to cash out` });
      const color = themeColor(data);
      if (color !== null) e.setColor(color);

      const menu = new StringSelectMenuBuilder().setCustomId(makeId('~inv', viewer, 'filter')).addOptions(
        FILTERS.map((f) => ({ label: f.label, value: f.value, emoji: f.emoji, default: f.value === filter })),
      );
      return {
        embeds: [e],
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
          ...rows([
            button('~inv', viewer, ['prev'], 'Prev', ButtonStyle.Secondary, '◀️', page === 0),
            button('~inv', viewer, ['next'], 'Next', ButtonStyle.Secondary, '▶️', page >= pages - 1),
          ]),
        ],
      };
    };

    const response = await interaction.reply({ ...render(), withResponse: true });
    const message = response.resource?.message;
    if (!message) return;
    collect(message, { time: 120_000, idle: 60_000 }).on('collect', (i) => {
      (async () => {
        const action = parseId(i.customId).args[0];
        if (i.isStringSelectMenu()) {
          filter = i.values[0] as typeof filter;
          page = 0;
        } else if (action === 'prev') page = Math.max(0, page - 1);
        else if (action === 'next') page += 1;
        data = await getProfile(target.id);
        await i.update(render());
      })().catch((err) => logError('inventory', err));
    });
  },
});

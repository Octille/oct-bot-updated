import { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, relative } from '../../lib/format';
import { collect } from '../../lib/collect';
import { makeId } from '../../lib/customId';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { basics } from '../../content/shop';
import { cosmetics } from '../../content/cosmetics';
import { getItem } from '../../content/items';
import { nextUtcMidnight } from '../../game/streaks';
import { boughtToday, buy, displayName, getRotation } from '../../services/shop';
import { getProfile } from '../../services/economy';

async function render(userId: string, note?: string) {
  const { day, stock } = getRotation();
  const profile = await getProfile(userId);
  const owned = new Set(profile.cosmetics?.owned ?? []);
  const shopCosmetics = cosmetics.filter((c) => !c.rotationOnly);

  const e = embed('economy')
    .setTitle('🛒 Shop')
    .setDescription([note, `Wallet: **${coins(profile.wallet)}** • Use the menu to buy one, or \`/buy\` for more.`].filter(Boolean).join('\n'))
    .addFields(
      { name: '🧺 Always in stock', value: basics.map((b) => `${displayName(b)} — ${coins(b.price)}\n-# ${getItem(b.id)?.description ?? ''}`).join('\n') },
      { name: `✨ Today's rotation (changes ${relative(nextUtcMidnight(new Date()))})`, value: stock.map((s) => {
        const bought = boughtToday(profile, s.id, day);
        const status = owned.has(s.id) ? 'owned' : bought >= s.limit ? '~~limit reached~~' : `${bought}/${s.limit} bought today`;
        return `${displayName(s)} — ${coins(s.price)} • ${status}`;
      }).join('\n') + '\n-# Limits are per player and reset at 00:00 UTC.' },
      { name: '🎨 Cosmetics', value: shopCosmetics.map((c) => `${displayName({ id: c.id, kind: 'cosmetic' })} — ${coins(c.price)}${owned.has(c.id) ? ' ✅' : ''}`).join('\n') + '\n-# Equip with `/cosmetics`.' },
    );

  const options = [
    ...basics.map((b) => ({ id: b.id, price: b.price, kind: b.kind })),
    ...stock.filter((s) => boughtToday(profile, s.id, day) < s.limit && !owned.has(s.id)),
    ...shopCosmetics.filter((c) => !owned.has(c.id)).map((c) => ({ id: c.id, price: c.price, kind: 'cosmetic' as const })),
  ].slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId(makeId('~shop', userId)).setPlaceholder('Buy one...')
    .addOptions(options.map((o) => ({ label: `${displayName(o).replace(/^\S+ /, '')} — ${coins(o.price)}`.slice(0, 100), value: o.id })));
  return { embeds: [e], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('shop').setDescription('Browse the shop and today\'s rotation'),
  category: 'economy',
  defer: 'public',
  async execute({ interaction }) {
    const userId = interaction.user.id;
    const message = await interaction.editReply(await render(userId));
    collect(message, { time: 120_000, idle: 60_000 }).on('collect', (i) => {
      (async () => {
        if (!i.isStringSelectMenu()) return;
        let note: string;
        try {
          const p = await buy(userId, i.values[0]!, 1);
          note = `✅ Bought ${p.label} for ${coins(p.total)}.`;
        } catch (err) {
          if (!(err instanceof UserError)) throw err;
          note = `❌ ${err.message}`;
        }
        await i.update(await render(userId, note));
      })().catch((err) => logError('shop', err));
    });
  },
});

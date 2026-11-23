import { ActionRowBuilder, ButtonStyle, MessageFlags, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { itemLabel } from '../../content/items';
import { giveTax, tradeRules } from '../../content/social';
import { parseAmount } from '../../lib/amount';
import { collect } from '../../lib/collect';
import { ANYONE } from '../../lib/customId';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button, rows } from '../../lib/ui';
import { User } from '../../models/User';
import type { Profile } from '../../services/economy';
import { assertCanTransfer, checkItemOffer, coinsAfterTax, emptyOffer, existingPlayer, findItem, settleTrade, type Offer } from '../../services/trade';

function offerText(o: Offer): string {
  const lines = Object.entries(o.items).map(([id, q]) => itemLabel(id, q));
  if (o.coins) lines.unshift(`${coins(o.coins)} (they get ${coins(coinsAfterTax(o.coins))})`);
  return lines.join('\n') || '*Nothing yet*';
}

let nonce = 0;

export default defineCommand({
  data: new SlashCommandBuilder().setName('trade').setDescription('Swap items and coins with another player, safely')
    .addUserOption((o) => o.setName('user').setDescription('Who to trade with').setRequired(true)),
  category: 'social',
  guildOnly: true,
  async execute({ interaction, profile }) {
    const a = interaction.user.id;
    const target = interaction.options.getUser('user', true);
    const b = target.id;
    if (target.bot || a === b) throw new UserError('Pick another player.');
    assertCanTransfer(profile, 'You');
    assertCanTransfer(await existingPlayer(b), 'They');

    const offers: Record<string, Offer> = { [a]: emptyOffer(), [b]: emptyOffer() };
    const confirmed = new Set<string>();
    let note: string | null = null;
    let done = false;
    const title = `${titleIcon('trade')} Trade`;
    const name = (id: string) => (id === a ? interaction.user.displayName : target.displayName);

    const view = () => ({
      content: `<@${b}>`,
      embeds: [embed('economy').setTitle(title).setDescription([
        note,
        `<@${a}> ⇄ <@${b}>. Add items or coins, then both press **Confirm**. Any change clears confirmations.`,
        `-# Coins are taxed ${Math.round(giveTax * 100)}%. Expires after ${tradeRules.idleMinutes} minutes without changes.`,
      ].filter(Boolean).join('\n')).addFields(
        { name: `${confirmed.has(a) ? '✓ ' : ''}${name(a)} offers`, value: offerText(offers[a]!), inline: true },
        { name: `${confirmed.has(b) ? '✓ ' : ''}${name(b)} offers`, value: offerText(offers[b]!), inline: true },
      )],
      components: rows([
        button('~trade', ANYONE, ['item'], 'Add item', ButtonStyle.Secondary),
        button('~trade', ANYONE, ['coins'], 'Add coins', ButtonStyle.Secondary),
        button('~trade', ANYONE, ['clear'], 'Clear mine', ButtonStyle.Secondary),
        button('~trade', ANYONE, ['confirm'], `Confirm (${confirmed.size}/2)`, ButtonStyle.Success),
        button('~trade', ANYONE, ['cancel'], 'Cancel', ButtonStyle.Danger),
      ]),
      allowedMentions: { users: [b] },
    });

    await interaction.reply(view());
    const message = await interaction.fetchReply();
    const collector = collect(message, { time: 30 * 60_000, idle: tradeRules.idleMinutes * 60_000 , disableOnEnd: false });

    const askModal = async (i: ButtonInteraction, kind: 'item' | 'coins') => {
      const id = `~tm:${i.user.id}:${++nonce}`;
      const modal = new ModalBuilder().setCustomId(id).setTitle(kind === 'item' ? 'Add an item' : 'Add coins');
      if (kind === 'item') {
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('item').setLabel('Item name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('How many').setStyle(TextInputStyle.Short).setRequired(false).setValue('1').setMaxLength(6)),
        );
      } else {
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('How many coins (total you offer)').setPlaceholder('e.g. 5000, 2.5k, half').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)));
      }
      // The modal must be the first response to the click
      await i.showModal(modal);
      const m = await i.awaitModalSubmit({ time: 120_000, filter: (s) => s.customId === id && s.user.id === i.user.id }).catch(() => null);
      if (!m || done) return;
      await m.deferUpdate();
      const p = (await User.findById(i.user.id, null, { lean: true })) as unknown as Profile;
      const offer = offers[i.user.id]!;
      try {
        if (kind === 'item') {
          const item = findItem(m.fields.getTextInputValue('item'));
          if (!item) throw new UserError("I don't know that item.");
          const qty = Number(m.fields.getTextInputValue('qty') || '1');
          if (!Number.isSafeInteger(qty) || qty < 1) throw new UserError('Quantity must be a whole number.');
          if (!offer.items[item.id] && Object.keys(offer.items).length >= tradeRules.maxLinesPerSide) throw new UserError(`At most ${tradeRules.maxLinesPerSide} different items per side.`);
          checkItemOffer(p, item.id, qty, offer.items[item.id] ?? 0);
          offer.items[item.id] = (offer.items[item.id] ?? 0) + qty;
          note = `${icon('success')} ${name(i.user.id)} added ${itemLabel(item.id, qty)}.`;
        } else {
          const parsed = parseAmount(m.fields.getTextInputValue('amount'), p.wallet);
          if (!parsed.ok) throw new UserError(parsed.reason);
          if (parsed.value > p.wallet) throw new UserError(`You only have ${coins(p.wallet)}.`);
          offer.coins = parsed.value;
          note = `${icon('success')} ${name(i.user.id)} offers ${coins(parsed.value)}.`;
        }
        confirmed.clear();
        await interaction.editReply(view());
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        await m.followUp({ content: `${icon('error')} ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    };

    collector.on('collect', (i) => {
      (async () => {
        if (i.user.id !== a && i.user.id !== b) return i.reply({ content: "This isn't your trade.", flags: MessageFlags.Ephemeral });
        if (done) return i.deferUpdate();
        const action = i.customId.split(':')[2];
        if ((action === 'item' || action === 'coins') && i.isButton()) return askModal(i, action);
        if (action === 'cancel') {
          done = true;
          collector.stop('done');
          return i.update({ content: '', embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} ${name(i.user.id)} cancelled the trade.`)], components: [], allowedMentions: { parse: [] } });
        }
        if (action === 'clear') {
          offers[i.user.id] = emptyOffer();
          confirmed.clear();
          note = `${name(i.user.id)} cleared their side.`;
          return i.update(view());
        }
        // Confirm
        const empty = (o: Offer) => !o.coins && !Object.keys(o.items).length;
        if (empty(offers[a]!) && empty(offers[b]!)) return i.reply({ content: 'Add something first.', flags: MessageFlags.Ephemeral });
        confirmed.add(i.user.id);
        if (confirmed.size < 2) {
          note = `${name(i.user.id)} confirmed. Waiting for the other side.`;
          return i.update(view());
        }
        await i.deferUpdate();
        try {
          await settleTrade(a, b, offers);
        } catch {
          confirmed.clear();
          note = `${icon('error')} The trade didn't go through: someone no longer has everything they offered. Nothing moved.`;
          return interaction.editReply(view());
        }
        done = true;
        collector.stop('done');
        await interaction.editReply({
          content: '',
          embeds: [embed('success').setTitle(`${title} › Done`).setDescription(`${icon('success')} Trade complete.`).addFields(
            { name: `${name(a)} gave`, value: offerText(offers[a]!), inline: true },
            { name: `${name(b)} gave`, value: offerText(offers[b]!), inline: true },
          )],
          components: [],
          allowedMentions: { parse: [] },
        });
      })().catch((err) => logError('trade', err));
    });
    collector.on('end', (_c, reason) => {
      if (done || reason === 'done') return;
      done = true;
      interaction.editReply({ content: '', embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} The trade expired.`)], components: [], allowedMentions: { parse: [] } }).catch(() => undefined);
    });
  },
});

import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { coins, num } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { getItem, itemLabel } from '../../content/items';
import { itemChoices } from '../../services/items';
import { ecoGive, ecoLog, ecoReset, ecoTake } from '../../services/ecoAdmin';
import { coinFlows, dailyFlows, moneySupply, supplyHistory } from '../../services/ecoStats';
import { capacityOf } from '../../services/economy';

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${coins(Math.abs(n))}`;
const day = (d: number) => new Date(d * 86_400_000).toISOString().slice(5, 10);

function itemOption(interaction: ChatInputCommandInteraction): { id: string; qty: number } | undefined {
  const id = interaction.options.getString('item');
  if (!id) return undefined;
  if (!getItem(id)) throw new UserError("I don't know that item.");
  return { id, qty: interaction.options.getInteger('qty') ?? 1 };
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('eco').setDescription('Owner tools for the economy')
    .setDefaultMemberPermissions(0)
    .addSubcommand((s) => s.setName('give').setDescription('Give coins and/or an item')
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
      .addIntegerOption((o) => o.setName('coins').setDescription('Coins to add to their wallet').setMinValue(1))
      .addStringOption((o) => o.setName('item').setDescription('Item').setAutocomplete(true))
      .addIntegerOption((o) => o.setName('qty').setDescription('How many (default 1)').setMinValue(1).setMaxValue(10_000)))
    .addSubcommand((s) => s.setName('take').setDescription('Take coins and/or an item')
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
      .addIntegerOption((o) => o.setName('coins').setDescription('Coins to take').setMinValue(1))
      .addStringOption((o) => o.setName('from').setDescription('Wallet (default) or bank').addChoices({ name: 'Wallet', value: 'wallet' }, { name: 'Bank', value: 'bank' }))
      .addStringOption((o) => o.setName('item').setDescription('Item').setAutocomplete(true))
      .addIntegerOption((o) => o.setName('qty').setDescription('How many (default 1)').setMinValue(1).setMaxValue(10_000)))
    .addSubcommand((s) => s.setName('reset').setDescription('Reset a profile (keeps join date and veteran cosmetics)')
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
      .addBooleanOption((o) => o.setName('confirm').setDescription('True to really reset; false shows what would go').setRequired(true)))
    .addSubcommand((s) => s.setName('log').setDescription("A player's latest transactions")
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('stats').setDescription('Coins in circulation, created vs destroyed')
      .addIntegerOption((o) => o.setName('days').setDescription('Period (default 7)').addChoices({ name: '24 hours', value: 1 }, { name: '7 days', value: 7 }, { name: '30 days', value: 30 }))),
  category: 'utility',
  ownerOnly: true,
  defer: 'ephemeral',
  async autocomplete(interaction) {
    await interaction.respond(itemChoices(interaction.options.getFocused()));
  },
  async execute({ interaction }) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const by = interaction.user.id;

    if (sub === 'give' || sub === 'take') {
      const amount = interaction.options.getInteger('coins') ?? 0;
      const item = itemOption(interaction);
      if (!amount && !item) throw new UserError('Give at least coins or an item.');
      const from = (interaction.options.getString('from') ?? 'wallet') as 'wallet' | 'bank';
      const p = sub === 'give' ? await ecoGive(user!.id, by, amount, item) : await ecoTake(user!.id, by, amount, from, item);
      const what = [amount ? coins(amount) : null, item ? itemLabel(item.id, item.qty) : null].filter(Boolean).join(' and ');
      return interaction.editReply({ embeds: [embed('success').setDescription(
        `${icon('success')} ${sub === 'give' ? 'Gave' : 'Took'} ${what} ${sub === 'give' ? 'to' : `from ${sub === 'take' && amount ? `${from} of ` : ''}`}${user}.\nNow: wallet ${coins(p.wallet)} · bank ${coins(p.bank)} / ${coins(capacityOf(p))}`,
      )], allowedMentions: { parse: [] } });
    }

    if (sub === 'reset') {
      if (!interaction.options.getBoolean('confirm', true)) {
        return interaction.editReply({ embeds: [embed('warning').setDescription(
          `${icon('warning')} This wipes ${user}'s coins, items, levels, tools, pet, business, quests and stats. Their join date and veteran cosmetics stay. Run it again with \`confirm: True\` to go ahead.`,
        )], allowedMentions: { parse: [] } });
      }
      const removed = await ecoReset(user!.id, by);
      return interaction.editReply({ embeds: [embed('success').setDescription(
        `${icon('success')} Reset ${user}. Removed wallet ${coins(removed.wallet)} and bank ${coins(removed.bank)}.`,
      )], allowedMentions: { parse: [] } });
    }

    if (sub === 'log') {
      const rows = await ecoLog(user!.id);
      const lines = rows.map((r) => {
        const what = r.kind === 'item' ? `${r.delta > 0 ? '+' : '−'}${num(Math.abs(r.delta))} ${r.itemId}` : `${signed(r.delta)} ${r.kind}`;
        return `<t:${Math.floor(new Date(r.at).getTime() / 1000)}:R> \`${r.source}\` ${what}${r.transfer ? ' (transfer)' : ''}`;
      });
      return interaction.editReply({ embeds: [embed('utility').setTitle(`${titleIcon('info')} Transactions › ${user!.username}`)
        .setDescription(lines.length ? lines.join('\n') : 'No transactions yet.')], allowedMentions: { parse: [] } });
    }

    // stats
    const days = interaction.options.getInteger('days') ?? 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const [flows, perDay, supply, history] = await Promise.all([coinFlows(since), dailyFlows(Math.min(days, 14)), moneySupply(), supplyHistory(Math.min(days, 14))]);
    const top = (sign: 1 | -1) => flows.bySource.filter((f) => Math.sign(f.net) === sign).slice(0, 8).map((f) => `\`${f.source}\` ${coins(Math.abs(f.net))}`).join('\n') || '—';
    const period = days === 1 ? '24 hours' : `${days} days`;
    const e = embed('utility').setTitle(`${titleIcon('info')} Economy › last ${period}`)
      .setDescription([
        `**In circulation:** ${coins(supply.wallet + supply.bank)} (wallet ${coins(supply.wallet)} · bank ${coins(supply.bank)}) across ${num(supply.players)} players`,
        `**Created:** ${coins(flows.created)} · **Destroyed:** ${coins(flows.destroyed)} · **Net:** ${signed(flows.net)}${supply.wallet + supply.bank > 0 ? ` (${((flows.net / (supply.wallet + supply.bank)) * 100).toFixed(1)}% of supply)` : ''}`,
        '-# Player-to-player moves and coins carried over from v2 are not counted. Gambling shows the net house edge.',
      ].join('\n'))
      .addFields(
        { name: 'Top sources', value: top(1), inline: true },
        { name: 'Top sinks', value: top(-1), inline: true },
        { name: 'Per day (created / destroyed)', value: perDay.map((d) => `\`${day(d.day)}\` +${coins(d.created)} / −${coins(d.destroyed)}`).join('\n') },
      );
    if (history.length) e.addFields({ name: 'Money supply (start of day)', value: history.map((h) => `\`${day(h._id)}\` ${coins(h.wallet + h.bank)}`).join('\n') });
    return interaction.editReply({ embeds: [e] });
  },
});

import { icon } from '../../lib/icons';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { embed } from '../../lib/embeds';
import { bar, coins, num, relative } from '../../lib/format';
import { parseAmount } from '../../lib/amount';
import { themeColor, titled } from '../../lib/theme';
import { testNotice } from '../../lib/testMode';
import { EconomyError, UserError } from '../../lib/errors';
import { levelFromXp } from '../../content/levels';
import { boosts } from '../../content/consumables';
import { isActive } from '../../game/boosts';
import { capacityOf, deposit, withdraw, type Profile } from '../../services/economy';
import { inventoryOf, inventoryValue } from '../../services/items';
import { back, btn, ids, MAIN, NAV, row, type Payload, type ScreenCtx } from '../kit';
import type { ScreenModule } from './types';

/** The balance card, also used read-only for /balance @someone. */
export function balanceCard(profile: Profile, name: string, avatar: string | null, note?: string) {
  const cap = capacityOf(profile);
  const { level, into, needed } = levelFromXp(profile.account?.xp ?? 0);
  const items = inventoryValue(inventoryOf(profile));
  const active = (Object.keys(boosts) as (keyof typeof boosts)[])
    .filter((k) => isActive(profile.boosts, k))
    .map((k) => `${boosts[k].label} until ${relative(profile.boosts![k]!)}`);
  const e = embed('economy')
    .setTitle(`${icon('wallet')} ${titled(name, profile)}`)
    .addFields(
      { name: 'Wallet', value: `${icon('currency')} ${coins(profile.wallet)}`, inline: true },
      { name: 'Bank', value: `${coins(profile.bank)} / ${num(cap)}`, inline: true },
      { name: 'Net worth', value: `${icon('currency')} ${coins(profile.wallet + profile.bank + items)}\n-# incl. ${coins(items)} of items`, inline: true },
      { name: `Account level ${level}`, value: `${bar(into, needed)} ${num(into)} / ${num(needed)} XP` },
    )
    .setFooter({ text: [testNotice(), 'Wallet coins can be robbed. Bank coins are safe.'].filter(Boolean).join('\n') });
  if (avatar) e.setThumbnail(avatar);
  if (active.length) e.addFields({ name: 'Active boosts', value: active.join('\n') });
  const color = themeColor(profile);
  if (color !== null) e.setColor(color);
  if (note) e.setDescription(note);
  return e;
}

function amountModal(ctx: ScreenCtx, kind: 'dep' | 'wd'): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(kind === 'dep' ? 'How much to deposit?' : 'How much to withdraw?')
    .setPlaceholder('e.g. 5000, 2.5k, half, all')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);
  return new ModalBuilder()
    .setCustomId(ids.act(ctx.owner, ctx.origin, 'bal', `${kind}sub`))
    .setTitle(kind === 'dep' ? 'Deposit to bank' : 'Withdraw from bank')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export const balance: ScreenModule = {
  render(_path, ctx): Payload {
    const p = ctx.profile;
    const room = capacityOf(p) - p.bank;
    const depositable = Math.min(p.wallet, Math.max(0, room));
    const depReason = p.wallet <= 0 ? 'Wallet is empty' : room <= 0 ? 'Bank is full' : null;
    const lines = [
      ctx.note,
      depositable && depositable < p.wallet ? `Deposit all moves ${coins(depositable)} — that fills your bank.` : null,
    ].filter(Boolean).join('\n');
    return {
      embeds: [balanceCard(p, ctx.userName, null, lines || undefined)],
      components: [row(
        back(ctx, null),
        btn(ids.act(ctx.owner, ctx.origin, 'bal', 'wdall'), p.bank > 0 ? `Withdraw all · ${coins(p.bank)}` : 'Bank is empty', NAV, { disabled: p.bank <= 0 }),
        btn(ids.act(ctx.owner, ctx.origin, 'bal', 'wdamt'), 'Withdraw amount', NAV, { disabled: p.bank <= 0 }),
        btn(ids.act(ctx.owner, ctx.origin, 'bal', 'depamt'), 'Deposit amount', NAV, { disabled: !!depReason }),
        btn(ids.act(ctx.owner, ctx.origin, 'bal', 'depall'), depReason ?? `Deposit all · ${coins(depositable)}`, MAIN, { disabled: !!depReason }),
      )],
    };
  },

  async act(_path, action, _args, interaction, ctx) {
    try {
      switch (action) {
        case 'depamt':
        case 'wdamt':
          if (interaction.isButton()) await interaction.showModal(amountModal(ctx, action === 'depamt' ? 'dep' : 'wd'));
          return { handled: true };
        case 'depall': {
          const { amount, profile } = await deposit(ctx.owner, 'all');
          return { path: 'bal', note: `${icon('success')} Deposited **${coins(amount)}**. Bank ${coins(profile.bank)}` };
        }
        case 'wdall': {
          const { amount } = await withdraw(ctx.owner, 'all');
          return { path: 'bal', note: `${icon('success')} Withdrew **${coins(amount)}**.` };
        }
        case 'depsub':
        case 'wdsub': {
          if (!interaction.isModalSubmit()) return { path: 'bal' };
          const input = interaction.fields.getTextInputValue('amount');
          const dep = action === 'depsub';
          const isAll = ['all', 'max'].includes(input.trim().toLowerCase());
          const parsed = isAll ? null : parseAmount(input, dep ? ctx.profile.wallet : ctx.profile.bank);
          if (parsed && !parsed.ok) throw new UserError(parsed.reason);
          const request = parsed ? parsed.value : 'all';
          const { amount } = dep ? await deposit(ctx.owner, request) : await withdraw(ctx.owner, request);
          return { path: 'bal', note: dep ? `${icon('success')} Deposited **${coins(amount)}**.` : `${icon('success')} Withdrew **${coins(amount)}**.` };
        }
      }
    } catch (err) {
      if (err instanceof UserError || err instanceof EconomyError) return { path: 'bal', note: `${icon('error')} ${err.message}` };
      throw err;
    }
    return { path: 'bal' };
  },
};

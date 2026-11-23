import { ButtonStyle, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { bar, coins, num } from '../../lib/format';
import { levelFromXp } from '../../content/levels';
import { capacityOf, deposit, getProfile, withdraw, type Profile } from '../../services/economy';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, rows } from '../../lib/ui';
import { EconomyError } from '../../lib/errors';
import { logError } from '../../lib/logger';

function balanceEmbed(profile: Profile, name: string, avatar: string, note?: string) {
  const cap = capacityOf(profile);
  const { level, into, needed } = levelFromXp(profile.account?.xp ?? 0);
  const e = embed('economy')
    .setAuthor({ name: `${name}'s balance`, iconURL: avatar })
    .addFields(
      { name: '👛 Wallet', value: coins(profile.wallet), inline: true },
      { name: '🏦 Bank', value: `${coins(profile.bank)} / ${num(cap)}`, inline: true },
      { name: '💰 Net worth', value: coins(profile.wallet + profile.bank), inline: true },
      { name: `⭐ Account Level ${level}`, value: `${bar(into, needed)} ${num(into)} / ${num(needed)} XP` },
    )
    .setFooter({ text: 'Wallet coins can be robbed. Bank coins are safe.' });
  if (note) e.setDescription(note);
  return e;
}

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your wallet, bank and account level')
    .addUserOption((o) => o.setName('user').setDescription('Someone else to check')),
  category: 'economy',
  async execute({ interaction, profile }) {
    const target = interaction.options.getUser('user');
    if (target && target.id !== interaction.user.id) {
      if (target.bot) return interaction.reply({ content: "Bots don't carry wallets.", flags: MessageFlags.Ephemeral });
      const other = await getProfile(target.id);
      return interaction.reply({ embeds: [balanceEmbed(other, target.username, target.displayAvatarURL())] });
    }

    const me = interaction.user;
    const controls = () => rows([
      button('~bal', me.id, ['dep'], 'Deposit all', ButtonStyle.Success, '🏦'),
      button('~bal', me.id, ['wd'], 'Withdraw all', ButtonStyle.Secondary, '👛'),
    ]);
    const response = await interaction.reply({
      embeds: [balanceEmbed(profile, me.username, me.displayAvatarURL())],
      components: controls(),
      withResponse: true,
    });
    const message = response.resource?.message;
    if (!message) return;

    collect(message, { time: 60_000 }).on('collect', async (i) => {
      try {
        const action = parseId(i.customId).args[0];
        let note: string;
        try {
          const { amount } = action === 'dep' ? await deposit(me.id, 'all') : await withdraw(me.id, 'all');
          note = action === 'dep' ? `🏦 Deposited **${coins(amount)}**.` : `👛 Withdrew **${coins(amount)}**.`;
        } catch (err) {
          if (!(err instanceof EconomyError)) throw err;
          note = `❌ ${err.message}`;
        }
        const fresh = await getProfile(me.id);
        await i.update({ embeds: [balanceEmbed(fresh, me.username, me.displayAvatarURL(), note)], components: controls() });
      } catch (err) {
        logError('balance button', err);
      }
    });
  },
});

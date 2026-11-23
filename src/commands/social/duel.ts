import { ButtonStyle, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { MIN_BET, levelMaxBet } from '../../content/gambling';
import { duelRules, giveTax } from '../../content/social';
import { parseAmount } from '../../lib/amount';
import { collect } from '../../lib/collect';
import { ANYONE } from '../../lib/customId';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { randInt } from '../../lib/rng';
import { button, rows } from '../../lib/ui';
import { User } from '../../models/User';
import { settle, type Profile } from '../../services/economy';
import { isJailed } from '../../services/jail';
import { unlockLevel } from '../../services/progression';

export default defineCommand({
  data: new SlashCommandBuilder().setName('duel').setDescription('Challenge someone: first to click DRAW! wins the pot')
    .addUserOption((o) => o.setName('user').setDescription('Who to duel').setRequired(true))
    .addStringOption((o) => o.setName('bet').setDescription('Each of you puts in this much').setRequired(true)),
  category: 'social',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    const a = interaction.user.id;
    const target = interaction.options.getUser('user', true);
    const b = target.id;
    if (target.bot || a === b) throw new UserError('Pick another player.');
    const other = (await User.findById(b, null, { lean: true })) as unknown as Profile | null;
    if (!other) throw new UserError("They haven't played OctBot yet.");
    if (unlockLevel(profile) < duelRules.minLevel) throw new UserError(`Duels unlock at account level ${duelRules.minLevel}.`);
    const max = Math.min(levelMaxBet(unlockLevel(profile)), levelMaxBet(unlockLevel(other)));
    const parsed = parseAmount(interaction.options.getString('bet', true), Math.min(profile.wallet, max));
    if (!parsed.ok) throw new UserError(parsed.reason);
    const bet = parsed.value;
    if (bet < duelRules.minBet) throw new UserError(`The minimum bet is ${coins(MIN_BET)}.`);
    if (bet > max) throw new UserError(`The max bet between you two is ${coins(max)}.`);
    if (bet > profile.wallet) throw new UserError(`You only have ${coins(profile.wallet)}.`);
    const pot = bet * 2;
    const prize = pot - Math.floor(pot * giveTax);
    const title = `${titleIcon('duel')} Duel`;

    const message = await interaction.editReply({
      content: `<@${b}>`,
      embeds: [embed('economy').setTitle(title).setDescription([
        `<@${a}> challenges <@${b}> to a duel for **${coins(bet)}** each.`,
        `When it says **DRAW!**, the first to click wins **${coins(prize)}** (${Math.round(giveTax * 100)}% of the pot is taxed). Click too early and you lose.`,
        `-# Expires <t:${Math.floor((Date.now() + duelRules.acceptSeconds * 1000) / 1000)}:R>.`,
      ].join('\n'))],
      components: rows([button('~duel', b, ['accept'], `Accept · ${coins(bet)}`, ButtonStyle.Success), button('~duel', b, ['decline'], 'Decline', ButtonStyle.Danger)]),
      allowedMentions: { users: [b] },
    });

    let phase: 'invite' | 'waiting' | 'draw' | 'done' = 'invite';
    let drawTs = 0;
    const invite = collect(message, { time: duelRules.acceptSeconds * 1000, max: 1 , disableOnEnd: false });
    invite.on('collect', (i) => {
      (async () => {
        if (i.customId.endsWith('decline')) {
          phase = 'done';
          return i.update({ content: '', embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} <@${b}> declined.`)], components: [], allowedMentions: { parse: [] } });
        }
        const fresh = (await User.findById(b, { jailUntil: 1 }, { lean: true }));
        if (isJailed(fresh?.jailUntil)) {
          phase = 'done';
          return i.update({ content: '', embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} <@${b}> is in jail.`)], components: [], allowedMentions: { parse: [] } });
        }
        // Both stakes in one transaction: if either can't pay, nothing moves
        try {
          await settle([
            { userId: a, change: { wallet: -bet } },
            { userId: b, change: { wallet: -bet } },
          ], { source: 'duel.stake', meta: { a, b, bet } });
        } catch {
          phase = 'done';
          return i.update({ content: '', embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} One of you can't cover ${coins(bet)} any more. The duel is off.`)], components: [], allowedMentions: { parse: [] } });
        }
        phase = 'waiting';
        await i.update({ content: '', embeds: [embed('economy').setTitle(title).setDescription(`<@${a}> vs <@${b}> for **${coins(prize)}**.\n\nHands on your holsters… wait for it…`)], components: rows([button('~duel', ANYONE, ['shoot'], 'Wait…', ButtonStyle.Secondary)]), allowedMentions: { parse: [] } });
        await fight();
      })().catch((err) => logError('duel', err));
    });
    invite.on('end', (_c, reason) => {
      if (reason === 'time' && phase === 'invite') {
        phase = 'done';
        interaction.editReply({ content: '', embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} <@${b}> didn't answer.`)], components: [], allowedMentions: { parse: [] } }).catch(() => undefined);
      }
    });

    const finish = async (winner: string | null, line: string) => {
      if (phase === 'done') return;
      phase = 'done';
      if (winner) {
        const loser = winner === a ? b : a;
        await settle([
          { userId: winner, change: { wallet: prize, inc: { 'stats.duelsWon': 1 } } },
          { userId: loser, change: { inc: { 'stats.duelsLost': 1 } } },
        ], { source: 'duel.win', meta: { a, b, bet } });
      } else {
        await settle([{ userId: a, change: { wallet: bet } }, { userId: b, change: { wallet: bet } }], { source: 'duel.refund' });
      }
      await interaction.editReply({ content: '', embeds: [embed(winner ? 'success' : 'warning').setTitle(`${title} › ${winner ? 'Winner' : 'No contest'}`).setDescription(line)], components: [], allowedMentions: { parse: [] } });
    };

    const fight = async () => {
      const shots = collect(message, { time: duelRules.drawDelayMs[1] + duelRules.drawWindowMs + 5_000 , disableOnEnd: false });
      shots.on('collect', (i) => {
        (async () => {
          if (i.user.id !== a && i.user.id !== b) return i.reply({ content: "This isn't your duel.", flags: MessageFlags.Ephemeral });
          if (phase === 'done') return i.deferUpdate();
          const other = i.user.id === a ? b : a;
          // Judged on Discord's clock: a click stamped before DRAW! appeared is a false start
          if (phase === 'waiting' || i.createdTimestamp < drawTs) {
            await i.deferUpdate();
            shots.stop('done');
            return finish(other, `${icon('error')} <@${i.user.id}> shot too early! <@${other}> wins **${coins(prize)}**.`);
          }
          await i.deferUpdate();
          shots.stop('done');
          return finish(i.user.id, `${icon('success')} <@${i.user.id}> was faster and wins **${coins(prize)}**!`);
        })().catch((err) => logError('duel', err));
      });
      await new Promise((r) => setTimeout(r, randInt(duelRules.drawDelayMs[0], duelRules.drawDelayMs[1])));
      if (phase !== 'waiting') return;
      phase = 'draw';
      const drawn = await interaction.editReply({ embeds: [embed('economy').setTitle(title).setDescription(`# DRAW!`)], components: rows([button('~duel', ANYONE, ['shoot'], 'DRAW!', ButtonStyle.Success)]) });
      drawTs = drawn.editedTimestamp ?? Date.now();
      setTimeout(() => {
        if (phase === 'draw') {
          shots.stop('done');
          finish(null, `${icon('warning')} Nobody drew. Both stakes were refunded.`).catch((err) => logError('duel', err));
        }
      }, duelRules.drawWindowMs);
    };
  },
});

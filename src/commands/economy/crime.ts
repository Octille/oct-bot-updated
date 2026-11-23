import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, relative } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { moreCooldowns } from '../../content/earning';
import { crimes, crimeUnlockLevel } from '../../content/crime';
import { getItem, itemLabel } from '../../content/items';
import { rarityInfo } from '../../content/rarity';
import { commitCrime } from '../../game/crime';
import { apply } from '../../services/economy';
import { grant, incomeMultiplier } from '../../services/progression';
import { bailCost } from '../../services/jail';
import * as cooldownService from '../../services/cooldowns';

export default defineCommand({
  data: new SlashCommandBuilder().setName('crime').setDescription('Commit a crime. Big payouts, but you might end up in jail'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'crime', seconds: moreCooldowns.crime },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    if ((profile.account?.level ?? 0) < crimeUnlockLevel) throw new UserError(`Crime unlocks at account level **${crimeUnlockLevel}**. Keep grinding honestly for now.`);

    const message = await interaction.editReply({
      embeds: [embed('economy').setTitle('🦹 Pick your crime').setDescription(crimes.map((c) =>
        `${c.emoji} **${c.name}** — ${Math.round(c.success * 100)}% success • ${coins(c.payout[0])}–${coins(c.payout[1]).replace('₪ ', '')}\n` +
        `↳ Caught: ${coins(c.fine)} fine + ${c.jailMinutes} min in jail`).join('\n'))],
      components: rows(crimes.map((c, i) => button('~crime', userId, [i], c.name, i === 2 ? ButtonStyle.Danger : ButtonStyle.Secondary, c.emoji))),
    });

    let chosen = false;
    const collector = collect(message, { time: 30_000, max: 1, disableOnEnd: false });
    collector.on('collect', (i) => {
      chosen = true;
      (async () => {
        const crime = crimes[Number(parseId(i.customId).args[0])]!;
        const result = commitCrime(crime, profile.wallet, incomeMultiplier(profile));
        const done = rows(crimes.map((c, n) => button('~crime', userId, [n], c.name, c === crime ? (result.success ? ButtonStyle.Success : ButtonStyle.Danger) : ButtonStyle.Secondary, c.emoji, true)));

        if (result.success) {
          const { xp, levelUp } = await grant(userId, {
            wallet: result.coins,
            items: result.loot ? { [result.loot]: 1 } : undefined,
            inc: { 'stats.crimes': 1, [`stats.crimeWins.${crime.id}`]: 1, ...(result.loot ? { 'stats.crimeLoot': 1 } : {}) },
          }, { source: 'crime', xp: 'crime', profile, meta: { crime: crime.id, loot: result.loot } });
          const loot = result.loot
            ? `${rarityInfo[getItem(result.loot)!.rarity].emoji} **You also swiped a ${itemLabel(result.loot)}!** (only found through crime)`
            : null;
          await i.update({ embeds: [embed('economy').setTitle(`${crime.emoji} ${crime.name}`)
            .setDescription([`😎 ${result.line}`, `💰 **+${coins(result.coins)}**`, loot, levelUpText(levelUp)].filter(Boolean).join('\n'))
            .setFooter({ text: `+${xp} XP` })], components: done });
          return;
        }

        const jailUntil = new Date(Date.now() + result.jailMinutes * 60_000);
        await apply(userId, {
          wallet: result.fine ? -result.fine : undefined,
          set: { jailUntil },
          inc: { 'stats.crimes': 1, 'stats.crimesFailed': 1 },
        }, { source: 'crime.fine', meta: { crime: crime.id } });
        await i.update({ embeds: [embed('moderation').setTitle(`🚔 Busted — ${crime.name}`)
          .setDescription([
            result.line,
            result.fine ? `You paid a **${coins(result.fine)}** fine.` : 'You were too broke to fine.',
            `You're in jail until ${relative(jailUntil)}. Earning commands are locked until then.`,
            `💸 \`/bail\` gets you out now for **${coins(bailCost(jailUntil))}**.`,
          ].join('\n'))], components: done });
      })().catch((err) => logError('crime', err));
    });
    collector.on('end', () => {
      if (chosen) return;
      cooldownService.release(userId, 'crime').catch(() => undefined);
      interaction.editReply({ content: '⌛ You lost your nerve. Cooldown refunded.', components: [] }).catch(() => undefined);
    });
  },
});

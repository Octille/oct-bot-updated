import { ButtonStyle, SlashCommandBuilder, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { moreCooldowns } from '../../content/earning';
import { getItem, itemLabel } from '../../content/items';
import { rarityInfo } from '../../content/rarity';
import { treasureValue } from '../../content/digging';
import { appraisalBonus, makePlot, warmth, type Square } from '../../game/digging';
import { grant, incomeMultiplier, luckBonus } from '../../services/progression';
import { describeTool, equipped } from '../../services/tools';
import * as cooldownService from '../../services/cooldowns';

function squareFace(sq: Square): { emoji: string; label: string; style: ButtonStyle } {
  switch (sq.kind) {
    case 'treasure': return { emoji: sq.treasure.emoji, label: '\u200b', style: ButtonStyle.Success };
    case 'coins': return { emoji: '🪙', label: String(sq.coins), style: ButtonStyle.Primary };
    case 'junk': return { emoji: getItem(sq.itemId)?.emoji ?? '🗑️', label: '\u200b', style: ButtonStyle.Secondary };
    case 'dirt': return { emoji: '🕳️', label: '\u200b', style: ButtonStyle.Secondary };
  }
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('dig').setDescription('Dig a 3×3 plot for buried treasure — follow the hints'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'dig', seconds: moreCooldowns.dig },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const shovel = equipped(profile, 'shovel');
    if (!shovel.tool) throw new UserError('You need a shovel. Buy a 🥄 Trowel in `/tools`.');
    if (shovel.broken) throw new UserError(`Your ${shovel.tool.name} is broken. \`/tools\` to repair it.`);

    const incomeMult = incomeMultiplier(profile);
    const plot = makePlot((shovel.tool.luck ?? 0) + luckBonus(profile), (shovel.tool.valueMult ?? 1) * incomeMult);
    const maxDigs = shovel.tool.digs ?? 2;
    const dug: number[] = [];
    const hints: string[] = [];

    const grid = (revealAll = false) => rows(plot.squares.map((sq, i) => {
      const open = dug.includes(i) || revealAll;
      if (!open) return button('~dig', userId, [i], '\u200b', ButtonStyle.Secondary, '🟫', revealAll);
      const face = squareFace(sq);
      return button('~dig', userId, [i], face.label, dug.includes(i) ? face.style : ButtonStyle.Secondary, face.emoji, true);
    }));
    const status = (extra?: string) => embed('economy').setTitle('⛏️ Digging')
      .setDescription([
        `Somewhere in this plot is buried treasure. You have **${maxDigs - dug.length}** dig${maxDigs - dug.length === 1 ? '' : 's'} left.`,
        hints.length ? hints.join('\n') : 'Pick a square. Each dig tells you if you\'re **🔥 warm** (treasure next to it) or **❄️ cold**.',
        extra,
      ].filter(Boolean).join('\n\n'))
      .setFooter({ text: describeTool(shovel, 'shovel').replace(/\*\*/g, '') });

    const message = await interaction.editReply({ embeds: [status()], components: grid() });
    let finished = false;

    const finish = async (i: ButtonInteraction | StringSelectMenuInteraction | null) => {
      if (finished) return;
      finished = true;
      collector.stop('done');
      if (dug.length === 0) {
        await cooldownService.release(userId, 'dig');
        await interaction.editReply({ embeds: [status('⌛ You never broke ground. Cooldown refunded.')], components: grid(true) });
        return;
      }
      let wallet = 0;
      const items: Record<string, number> = {};
      const lines: string[] = [];
      let foundTreasure = false;
      for (const index of dug) {
        const sq = plot.squares[index]!;
        if (sq.kind === 'coins') wallet += sq.coins;
        if (sq.kind === 'junk') items[sq.itemId] = (items[sq.itemId] ?? 0) + 1;
        if (sq.kind === 'treasure') {
          foundTreasure = true;
          const bonus = appraisalBonus(sq);
          wallet += bonus;
          items[sq.treasure.id] = (items[sq.treasure.id] ?? 0) + 1;
          const info = rarityInfo[sq.treasure.rarity];
          lines.push(`${info.emoji} **TREASURE! ${sq.treasure.emoji} ${sq.treasure.name}** (${info.label}) — sells for ${coins(treasureValue[sq.treasure.rarity])}${bonus ? `, plus **+${coins(bonus)}** appraisal bonus` : ''}`);
        }
      }
      if (wallet) lines.push(`🪙 **+${coins(wallet)}** total`);
      const junk = dug.map((idx) => plot.squares[idx]!).filter((sq): sq is Extract<Square, { kind: 'junk' }> => sq.kind === 'junk');
      if (junk.length) lines.push(`Also dug up: ${junk.map((sq) => itemLabel(sq.itemId)).join(', ')}`);
      const hidden = plot.squares[plot.treasureAt] as Extract<Square, { kind: 'treasure' }>;
      if (!foundTreasure) lines.push(`The ${hidden.treasure.emoji} ${hidden.treasure.name} was right there (shown below). So close.`);

      const { xp, levelUp } = await grant(userId, {
        wallet: wallet || undefined,
        items,
        inc: { 'tools.shovel.durability': -1, 'stats.digs': 1, ...(foundTreasure ? { 'stats.treasures': 1 } : {}) },
        where: { 'tools.shovel.durability': { $gte: 1 } },
      }, { source: 'dig', xp: 'dig', profile, meta: { digs: dug.length, treasure: foundTreasure } });
      const lvl = levelUpText(levelUp);
      if (lvl) lines.push(lvl);

      const payload = { embeds: [status(lines.join('\n')).setFooter({ text: `+${xp} XP` })], components: grid(true) };
      if (i) await i.update(payload);
      else await interaction.editReply(payload);
    };

    const collector = collect(message, { time: 45_000, idle: 20_000, disableOnEnd: false });
    collector.on('collect', (i) => {
      (async () => {
        const index = Number(parseId(i.customId).args[0]);
        if (dug.includes(index) || finished) return i.deferUpdate();
        dug.push(index);
        const sq = plot.squares[index]!;
        if (sq.kind === 'treasure') hints.push(`Dig ${dug.length}: 💎 **Treasure!**`);
        else hints.push(`Dig ${dug.length}: ${warmth(index, plot.treasureAt) === 'hot' ? '🔥 **Warm!** It\'s next to this one.' : '❄️ Cold.'}`);
        if (dug.length >= maxDigs) return finish(i);
        await i.update({ embeds: [status()], components: grid() });
      })().catch((err) => logError('dig', err));
    });
    collector.on('end', (_c, reason) => {
      if (reason === 'done') return;
      finish(null).catch((err) => logError('dig', err));
    });
  },
});

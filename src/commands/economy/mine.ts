import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { pick } from '../../lib/rng';
import { cooldowns } from '../../content/earning';
import { itemLabel } from '../../content/items';
import { resolveMine, rollTunnels } from '../../game/mining';
import { grant, incomeMultiplier, luckBonus } from '../../services/progression';
import { boostEffect } from '../../content/consumables';
import { describeTool, equipped } from '../../services/tools';
import * as cooldownService from '../../services/cooldowns';

const FLAVOUR: Record<string, string[]> = {
  coal: ['Chunks of coal tumble into your cart.', 'Dusty work, but coal is coal.'],
  iron: ['Your pick rings off a thick seam of iron.', 'Solid iron. The smelter will love it.'],
  gold: ['Gold glints in your lantern light.', 'You grin as gold nuggets roll out.'],
  diamond: ['Your pick hits something impossibly hard. **DIAMONDS.**', 'A flawless diamond seam. You just stare at it.'],
  amethyst: ['A deep purple glow floods the tunnel. **Amethyst!**', 'Enormous amethyst crystals, glowing softly.'],
};

export default defineCommand({
  data: new SlashCommandBuilder().setName('mine').setDescription('Pick a tunnel and mine for ore'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'mine', seconds: cooldowns.mine },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const pickaxe = equipped(profile, 'pickaxe');
    const toolMult = pickaxe.tool && !pickaxe.broken ? pickaxe.tool.mult ?? 1 : 1;
    const choices = rollTunnels();

    const message = await interaction.editReply({
      embeds: [embed('economy')
        .setTitle('⛏️ Pick a tunnel')
        .setDescription(choices.map((t) => `${t.emoji} **${t.name}** — ${t.hint}`).join('\n'))
        .setFooter({ text: `${describeTool(pickaxe, 'pickaxe').replace(/\*\*/g, '')}${pickaxe.broken ? ' (mining bare-handed until repaired)' : ''}` })],
      components: rows(choices.map((t, i) => button('~mine', userId, [i], t.name, ButtonStyle.Secondary, t.emoji))),
    });

    let chosen = false;
    const collector = collect(message, { time: 30_000, max: 1, disableOnEnd: false });
    collector.on('collect', (i) => {
      chosen = true;
      (async () => {
        const tunnel = choices[Number(parseId(i.customId).args[0])]!;
        const result = resolveMine(tunnel, toolMult, incomeMultiplier(profile), undefined, luckBonus(profile) ? boostEffect.gemMult : 1);
        const usesTool = !!pickaxe.tool && !pickaxe.broken;
        const used = usesTool ? Math.min(result.durabilityUsed, pickaxe.durability) : 0;

        const { xp, levelUp, profile: after } = await grant(userId, {
          wallet: result.coins,
          items: result.gemId ? { [result.gemId]: 1 } : undefined,
          inc: {
            'stats.mined': 1,
            ...(result.caveIn ? { 'stats.caveIns': 1 } : {}),
            ...(result.gemId ? { 'stats.gemsFound': 1 } : {}),
            ...(used ? { 'tools.pickaxe.durability': -used } : {}),
          },
          where: used ? { 'tools.pickaxe.durability': { $gte: used } } : undefined,
        }, { source: 'mine', xp: 'mine', profile, meta: { tunnel: tunnel.id, ore: result.ore.id } });

        const toolNow = equipped(after, 'pickaxe');
        const lines = result.caveIn
          ? [`💥 **CAVE-IN!** The ${tunnel.name} collapses. You scramble out with a few scraps.`, `💰 **+${coins(result.coins)}**`]
          : [pick(FLAVOUR[result.ore.id] ?? FLAVOUR.coal!), `${result.ore.emoji} **${result.ore.name}** • 💰 **+${coins(result.coins)}**`];
        if (result.gemId) lines.push(`💎 You also found a **${itemLabel(result.gemId)}**!`);
        if (usesTool && toolNow.broken) lines.push('🔨 **Your pickaxe broke!** `/tools` to repair it.');
        const lvl = levelUpText(levelUp);
        if (lvl) lines.push(lvl);

        await i.update({
          embeds: [embed('economy')
            .setColor(result.caveIn ? 0x7f5539 : result.ore.color)
            .setTitle(`${tunnel.emoji} ${tunnel.name}`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `+${xp} XP • ${describeTool(toolNow, 'pickaxe').replace(/\*\*/g, '')}` })],
          components: rows(choices.map((t, n) => button('~mine', userId, [n], t.name, t.id === tunnel.id ? ButtonStyle.Primary : ButtonStyle.Secondary, t.emoji, true))),
        });
      })().catch((err) => logError('mine', err));
    });
    collector.on('end', () => {
      if (chosen) return;
      // Nobody picked: give the cooldown back
      cooldownService.release(userId, 'mine').catch(() => undefined);
      interaction.editReply({ content: '⌛ You stood at the entrance too long. Your cooldown was refunded.', components: [] }).catch(() => undefined);
    });
  },
});

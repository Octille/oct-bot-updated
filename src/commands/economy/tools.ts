import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { bar, coins } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { nextTool, repairCost, type ToolSlot } from '../../content/tools';
import { getProfile, type Profile } from '../../services/economy';
import { describeTool, equipped, repair, upgrade } from '../../services/tools';

const SLOTS: { slot: ToolSlot; label: string; use: string }[] = [
  { slot: 'pickaxe', label: '⛏️ Pickaxe', use: 'multiplies /mine hauls' },
  { slot: 'rod', label: '🎣 Rod', use: 'better fish and more time to reel' },
];

function view(profile: Profile, note?: string) {
  const level = profile.account?.level ?? 0;
  const e = embed('economy').setTitle('🧰 Your tools').setFooter({ text: `Wallet: ${coins(profile.wallet)} • Every use costs 1 durability; cave-ins cost more.` });
  if (note) e.setDescription(note);
  for (const { slot, label, use } of SLOTS) {
    const eq = equipped(profile, slot);
    const next = nextTool(slot, eq.tool?.id);
    const lines = [describeTool(eq, slot)];
    if (eq.tool) lines.push(bar(eq.durability, eq.tool.durability, 12));
    if (eq.tool && eq.durability < eq.tool.durability) lines.push(`🔧 Repair: ${coins(repairCost(eq.tool, eq.durability))}`);
    if (next) {
      const lock = next.level > level ? ` 🔒 Level ${next.level}` : '';
      const stat = slot === 'pickaxe' ? `${next.mult}× haul` : `luck +${next.luck}, +${(next.windowBonusMs ?? 0) / 1000}s to reel`;
      lines.push(`⬆️ Next: ${next.emoji} **${next.name}** — ${coins(next.cost)} (${stat})${lock}`);
    } else lines.push('🏆 Best in the game.');
    e.addFields({ name: `${label} — ${use}`, value: lines.join('\n') });
  }
  return e;
}

function controls(profile: Profile, ownerId: string) {
  const level = profile.account?.level ?? 0;
  return rows(SLOTS.flatMap(({ slot }) => {
    const eq = equipped(profile, slot);
    const next = nextTool(slot, eq.tool?.id);
    const canRepair = !!eq.tool && eq.durability < eq.tool.durability && profile.wallet >= repairCost(eq.tool, eq.durability);
    const canUpgrade = !!next && next.level <= level && profile.wallet >= next.cost;
    const name = slot === 'pickaxe' ? 'pickaxe' : 'rod';
    return [
      button('~tools', ownerId, ['up', slot], next ? `Buy ${next.name}` : `Max ${name}`, ButtonStyle.Success, '⬆️', !canUpgrade),
      button('~tools', ownerId, ['fix', slot], `Repair ${name}`, ButtonStyle.Secondary, '🔧', !canRepair),
    ];
  }));
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('tools').setDescription('Upgrade and repair your pickaxe and fishing rod'),
  category: 'economy',
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const response = await interaction.reply({ embeds: [view(profile)], components: controls(profile, userId), withResponse: true });
    const message = response.resource?.message;
    if (!message) return;

    collect(message, { time: 90_000 }).on('collect', (i) => {
      (async () => {
        const [action, slot] = parseId(i.customId).args as ['up' | 'fix', ToolSlot];
        let note: string;
        try {
          if (action === 'up') {
            const { tool } = await upgrade(userId, slot);
            note = `✅ Bought the ${tool.emoji} **${tool.name}**!`;
          } else {
            const { tool, cost } = await repair(userId, slot);
            note = `🔧 Repaired your ${tool.name} for ${coins(cost)}.`;
          }
        } catch (err) {
          if (!(err instanceof UserError)) throw err;
          note = `❌ ${err.message}`;
        }
        const fresh = await getProfile(userId);
        await i.update({ embeds: [view(fresh, note)], components: controls(fresh, userId) });
      })().catch((err) => logError('tools', err));
    });
  },
});

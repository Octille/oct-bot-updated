import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { num } from '../../lib/format';
import { fishSpecies } from '../../content/fishing';
import { rarities, rarityInfo } from '../../content/rarity';
import { getProfile } from '../../services/economy';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('fishdex')
    .setDescription('Every fish species you have caught')
    .addUserOption((o) => o.setName('user').setDescription("Someone else's fishdex")),
  category: 'economy',
  async execute({ interaction, profile }) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const data = user.id === interaction.user.id ? profile : await getProfile(user.id);
    const dex = (data.fishdex ?? {}) as Record<string, { caught: number; biggest: number }>;
    const found = fishSpecies.filter((f) => (dex[f.id]?.caught ?? 0) > 0).length;

    const e = embed('economy')
      .setTitle(`📘 ${user.username}'s Fishdex — ${found}/${fishSpecies.length}`)
      .setFooter({ text: `${num(data.stats?.fishCaught ?? 0)} fish caught in total` });
    for (const rarity of rarities) {
      const species = fishSpecies.filter((f) => f.rarity === rarity);
      if (!species.length) continue;
      const lines = species.map((f) => {
        const entry = dex[f.id];
        return entry?.caught
          ? `${f.emoji} **${f.name}** ×${num(entry.caught)} • best ${num(entry.biggest)} kg`
          : '❔ ???';
      });
      e.addFields({ name: `${rarityInfo[rarity].emoji} ${rarityInfo[rarity].label}`, value: lines.join('\n'), inline: true });
    }
    await interaction.reply({ embeds: [e] });
  },
});

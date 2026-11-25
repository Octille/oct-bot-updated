import { SlashCommandBuilder, escapeMarkdown } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { seasonRules } from '../../content/events';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { titleIcon } from '../../lib/icons';
import { itemName } from '../../content/items';
import { getCosmetic } from '../../content/cosmetics';
import { SeasonScore } from '../../models/Events';
import { currentSeason, seasonBounds, seasonConfig, seasonRank } from '../../services/seasons';
import { btn, ids, NAV, row } from '../../ui/kit';

export default defineCommand({
  data: new SlashCommandBuilder().setName('season').setDescription('The current season: your points, the top players and the rewards'),
  category: 'events',
  defer: 'public',
  async execute({ interaction }) {
    const now = new Date();
    const season = currentSeason(now);
    const cfg = seasonConfig();
    const e = embed('events').setTitle(`${titleIcon('season')} Season${season ? ` ${season}` : ''}`);
    if (!season) {
      e.setDescription(cfg.start ? `Season 1 starts <t:${Math.floor(cfg.start.getTime() / 1000)}:R>.` : "Seasons haven't started yet.");
      return interaction.editReply({ embeds: [e] });
    }
    const bounds = seasonBounds(season)!;
    const [top, me] = await Promise.all([
      SeasonScore.find({ season }, null, { lean: true }).sort({ points: -1, userId: 1 }).limit(10),
      seasonRank(season, interaction.user.id),
    ]);
    const names = await Promise.all(top.map(async (t) => {
      try {
        const u = await interaction.client.users.fetch(t.userId);
        return escapeMarkdown(u.globalName ?? u.username);
      } catch { return 'Unknown player'; }
    }));
    e.setDescription([
      `Ends <t:${Math.floor(bounds.end.getTime() / 1000)}:R>. Points come from activities (+${seasonRules.points.activity}), quests (+${seasonRules.points.dailyQuest} daily, +${seasonRules.points.weeklyQuest} weekly) and raid attacks (+${seasonRules.points.raidAttack}).`,
      '',
      ...(top.length ? top.map((t, i) => `**#${i + 1}** ${names[i]} · ${num(t.points)}`) : ['Nobody has points yet.']),
      '',
      me ? `**You:** #${num(me.rank)} · ${num(me.points)} points` : "**You:** no points yet this season.",
    ].join('\n')).addFields({
      name: 'Season rewards',
      value: seasonRules.rewards.map((r) => `#${r.from}${r.to > r.from ? `–${r.to}` : ''}: ${coins(r.coins)} + ${itemName(r.crate)} + ${getCosmetic(r.badge)?.name} badge`).join('\n') + `\n-# At least ${seasonRules.minPoints} points to place. Wallets don't reset.`,
    });
    return interaction.editReply({ embeds: [e], components: [row(btn(ids.go(interaction.user.id, 'menu'), 'Menu', NAV))] });
  },
});

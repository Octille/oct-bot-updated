const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getPlayer, num, ratio, run } = require('../../functions/hypixel');

const MODES = { UHC: 'uhc_duel', Classic: 'classic_duel', OP: 'op_duel', SkyWars: 'sw_duel', Sumo: 'sumo_duel', Bridge: 'bridge_duel' };

module.exports = {
  name: 'duels',
  description: 'Hypixel Duels stats',
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a player name.');
    await run(message, async () => {
      const { name, player } = await getPlayer(args[0]);
      const d = player.stats?.Duels;
      if (!d) return message.reply(`**${name}** has never played Duels.`);

      const embed = new EmbedBuilder()
        .setTitle(`Duels stats of ${name}`)
        .setColor(colors.Gold)
        .addFields(
          { name: 'Games Played', value: num(d.games_played_duels), inline: true },
          { name: 'Wins', value: num(d.wins), inline: true },
          { name: 'WLR', value: ratio(d.wins, d.losses), inline: true },
          { name: 'Kills', value: num(d.kills), inline: true },
          { name: 'KDR', value: ratio(d.kills, d.deaths), inline: true },
          { name: 'Coins', value: num(d.coins), inline: true },
          { name: 'Winstreak', value: `${d.current_winstreak ?? 'hidden'} (best ${d.best_overall_winstreak ?? '?'})`, inline: true },
        );

      for (const [label, key] of Object.entries(MODES)) {
        // Bridge counts goals instead of kills
        const kills = d[`${key}_kills`] ?? d[`${key}_bridge_kills`];
        embed.addFields({
          name: label,
          inline: true,
          value: `**Wins:** ${num(d[`${key}_wins`])}\n**Losses:** ${num(d[`${key}_losses`])}\n**Kills:** ${num(kills)}`,
        });
      }
      message.channel.send({ embeds: [embed] });
    });
  },
};

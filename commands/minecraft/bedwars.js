const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getPlayer, num, ratio, run } = require('../../functions/hypixel');

const MODES = { Solo: 'eight_one_', Doubles: 'eight_two_', '3v3v3v3': 'four_three_', '4v4v4v4': 'four_four_' };

module.exports = {
  name: 'bedwars',
  aliases: ['bw'],
  description: 'Hypixel BedWars stats',
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a player name.');
    await run(message, async () => {
      const { name, player } = await getPlayer(args[0]);
      const bw = player.stats?.Bedwars;
      if (!bw) return message.reply(`**${name}** has never played BedWars.`);

      const stat = (prefix, key) => bw[`${prefix}${key}_bedwars`] || 0;
      const embed = new EmbedBuilder()
        .setTitle(`BedWars stats of ${name}`)
        .setColor(colors.MainColor)
        .addFields({
          name: 'Overall',
          value: [
            `**Level:** ${player.achievements?.bedwars_level || 0} ✫`,
            `**Wins:** ${num(stat('', 'wins'))}  **Losses:** ${num(stat('', 'losses'))}`,
            `**Final Kills:** ${num(stat('', 'final_kills'))}  **FKDR:** ${ratio(stat('', 'final_kills'), stat('', 'final_deaths'))}`,
            `**Beds Broken:** ${num(stat('', 'beds_broken'))}`,
            `**Winstreak:** ${bw.winstreak ?? 'hidden'}  **Coins:** ${num(bw.coins)}`,
          ].join('\n'),
        });

      for (const [label, prefix] of Object.entries(MODES)) {
        embed.addFields({
          name: label,
          inline: true,
          value: [
            `**Wins:** ${num(stat(prefix, 'wins'))}`,
            `**Losses:** ${num(stat(prefix, 'losses'))}`,
            `**Kills:** ${num(stat(prefix, 'kills'))}`,
            `**FKDR:** ${ratio(stat(prefix, 'final_kills'), stat(prefix, 'final_deaths'))}`,
          ].join('\n'),
        });
      }
      message.channel.send({ embeds: [embed] });
    });
  },
};

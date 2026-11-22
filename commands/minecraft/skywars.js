const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getPlayer, num, ratio, run } = require('../../functions/hypixel');

module.exports = {
  name: 'skywars',
  aliases: ['sw'],
  description: 'Hypixel SkyWars stats',
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a player name.');
    await run(message, async () => {
      const { name, player } = await getPlayer(args[0]);
      const sw = player.stats?.SkyWars;
      if (!sw) return message.reply(`**${name}** has never played SkyWars.`);

      const level = (sw.levelFormatted || '').replace(/§./g, '') || '1⋆';
      const block = (suffix) => [
        `**Wins:** ${num(sw[`wins${suffix}`])}`,
        `**Losses:** ${num(sw[`losses${suffix}`])}`,
        `**Kills:** ${num(sw[`kills${suffix}`])}`,
        `**KDR:** ${ratio(sw[`kills${suffix}`], sw[`deaths${suffix}`])}`,
      ].join('\n');

      message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle(`SkyWars stats of ${name}`)
        .setColor(colors.Aqua)
        .addFields(
          { name: 'Level', value: level, inline: true },
          { name: 'Coins', value: num(sw.coins), inline: true },
          { name: 'Souls', value: num(sw.souls), inline: true },
          { name: 'Heads', value: num(sw.heads), inline: true },
          { name: 'Opals', value: num(sw.opals), inline: true },
          { name: 'Winstreak', value: `${sw.win_streak ?? 'hidden'}`, inline: true },
          { name: 'Overall', value: block(''), inline: true },
          { name: 'Solo', value: block('_solo'), inline: true },
          { name: 'Team', value: block('_team'), inline: true },
        )] });
    });
  },
};

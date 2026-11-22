const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getPlayer, num, ratio, run } = require('../../functions/hypixel');

module.exports = {
  name: 'uhc',
  description: 'Hypixel UHC Champions stats',
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a valid player name.');
    await run(message, async () => {
      const { name, player } = await getPlayer(args[0]);
      const uhc = player.stats?.UHC;
      if (!uhc) return message.reply(`**${name}** has never played UHC.`);

      const block = (suffix) => [
        `**Wins:** ${num(uhc[`wins${suffix}`])}`,
        `**Kills:** ${num(uhc[`kills${suffix}`])}`,
        `**Deaths:** ${num(uhc[`deaths${suffix}`])}`,
        `**KDR:** ${ratio(uhc[`kills${suffix}`], uhc[`deaths${suffix}`])}`,
      ].join('\n');

      message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle(`UHC Champions stats of ${name}`)
        .setColor(colors.White)
        .addFields(
          { name: 'Score', value: num(uhc.score), inline: true },
          { name: 'Coins', value: num(uhc.coins), inline: true },
          { name: '​', value: '​', inline: true },
          { name: 'Teams', value: block(''), inline: true },
          { name: 'Solo', value: block('_solo'), inline: true },
        )] });
    });
  },
};

const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
module.exports = {
  name: 'bedwars',
  aliases: ['bw'],
  description: 'Shows BedWars stats for a Hypixel player',
  async execute(message, args) {
    if (!args.length) return message.reply('Please provide a player name.');
    const fetch = (await import('cross-fetch')).default;
    const res = await fetch(`https://api.slothpixel.me/api/players/${args[0]}`);
    const data = await res.json();
    if (data.error === 'Player does not exist') return message.reply('That player does not exist.');
    const bw = data?.stats?.BedWars;
    if (!bw) return message.reply('Could not find BedWars stats for that player.');
    const gm = bw.gamemodes || {};
    const solo = gm.solo || {};
    const doubles = gm.doubles || {};
    const threes = gm['3v3v3v3'] || {};
    const fours = gm['4v4v4v4'] || {};
    const embed = new EmbedBuilder()
      .setTitle(`BedWars stats of ${data.username}`)
      .setColor(colors.MainColor)
      .addFields(
        { name: 'Overall', value: [`**Level:** ${bw.level}`, `**Wins:** ${bw.wins}`, `**Losses:** ${bw.losses}`, `**Final Kills:** ${bw.final_kills}`, `**Final Deaths:** ${bw.final_deaths}`, `**Beds Broken:** ${bw.beds_broken}`].join('\n'), inline: true },
        { name: 'Solo', value: [`**Wins:** ${solo.wins || 0}`, `**Losses:** ${solo.losses || 0}`, `**Kills:** ${solo.kills || 0}`, `**Deaths:** ${solo.deaths || 0}`].join('\n'), inline: true },
        { name: 'Doubles', value: [`**Wins:** ${doubles.wins || 0}`, `**Losses:** ${doubles.losses || 0}`, `**Kills:** ${doubles.kills || 0}`, `**Deaths:** ${doubles.deaths || 0}`].join('\n'), inline: true },
        { name: '3v3v3v3', value: [`**Wins:** ${threes.wins || 0}`, `**Losses:** ${threes.losses || 0}`, `**Kills:** ${threes.kills || 0}`, `**Deaths:** ${threes.deaths || 0}`].join('\n'), inline: true },
        { name: '4v4v4v4', value: [`**Wins:** ${fours.wins || 0}`, `**Losses:** ${fours.losses || 0}`, `**Kills:** ${fours.kills || 0}`, `**Deaths:** ${fours.deaths || 0}`].join('\n'), inline: true }
      );
    message.channel.send({ embeds: [embed] });
  }
};

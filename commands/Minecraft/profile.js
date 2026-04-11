const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
module.exports = {
  name: 'player',
  aliases: ['profile'],
  description: 'View a Hypixel player profile',
  async execute(message, args) {
    if (!args.length) return message.reply('Please provide a player name.');
    const fetch = (await import('cross-fetch')).default;
    const res = await fetch(`https://api.slothpixel.me/api/players/${args[0]}`);
    const data = await res.json();
    if (data.error === 'Player does not exist') return message.reply('That player does not exist.');
    const embed = new EmbedBuilder()
      .setTitle(data.username)
      .setColor(data.online ? colors.Green : colors.Red)
      .addFields(
        { name: '**Online status**', value: data.online ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: '**UUID**', value: data.uuid, inline: true },
        { name: '**Level**', value: `${Math.floor(data.level)}`, inline: true },
        { name: '**Last game**', value: data.last_game || 'Unknown', inline: true }
      );
    message.channel.send({ embeds: [embed] });
  }
};

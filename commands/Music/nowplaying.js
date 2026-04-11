const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'nowplaying',
  aliases: ['np'],
  description: 'Show what is currently playing',
  async execute(message, args, cmd, client) {
    const queue = client.distube.getQueue(message);
    if (!queue || !queue.songs.length) return message.channel.send('Nothing is currently playing!');
    const song = queue.songs[0];
    if (!song) return message.channel.send('Nothing is currently playing!');
    const embed = new EmbedBuilder()
      .setTitle('Now Playing')
      .setDescription(`[${song.name}](${song.url})\nDuration: \`${song.formattedDuration}\``)
      .setThumbnail(song.thumbnail)
      .setColor('Blue');
    message.channel.send({ embeds: [embed] });
  }
};

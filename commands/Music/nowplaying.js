const { EmbedBuilder } = require('discord.js');

function formatDuration(ms) {
  if (!ms || ms === 0) return 'Live';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  name: 'nowplaying',
  aliases: ['np'],
  description: 'Show what is currently playing',
  async execute(message, args, cmd, client) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player?.queue?.current) return message.channel.send('Nothing is currently playing!');
    const track = player.queue.current;
    const embed = new EmbedBuilder()
      .setTitle('Now Playing')
      .setDescription(`[${track.info.title}](${track.info.uri})\nDuration: \`${formatDuration(track.info.duration)}\``)
      .setThumbnail(track.info.artworkUrl ?? null)
      .setColor('Blue');
    message.channel.send({ embeds: [embed] });
  },
};
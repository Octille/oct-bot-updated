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

module.exports = (client) => {

  client.lavalink.nodeManager.on('connect', (node) => console.log(`[Lavalink] Node "${node.id}" connected`));
  client.lavalink.nodeManager.on('disconnect', (node, reason) => console.warn(`[Lavalink] Node "${node.id}" disconnected:`, reason));
  client.lavalink.nodeManager.on('error', (node, error) => console.error(`[Lavalink] Node "${node.id}" error:`, error?.message));

  client.lavalink.on('trackStart', (player, track) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel) return;
    channel.send({ embeds: [new EmbedBuilder()
      .setAuthor({ name: '🎶 Now Playing' })
      .setTitle(track.info.title)
      .setURL(track.info.uri)
      .setThumbnail(track.info.artworkUrl ?? null)
      .addFields(
        { name: '👤 Artist', value: track.info.author || 'Unknown', inline: true },
        { name: '⏱️ Duration', value: `\`${formatDuration(track.info.duration)}\``, inline: true },
        { name: '🔊 Volume', value: `\`${player.volume}%\``, inline: true },
        { name: '🔁 Loop', value: `\`${player.repeatMode === 'track' ? 'This Song' : player.repeatMode === 'queue' ? 'All Queue' : 'Off'}\``, inline: true },
      )
      .setColor('#5865F2')
    ]}).catch(() => {});
  });

  client.lavalink.on('queueEnd', (player) => {
    const channel = client.channels.cache.get(player.textChannelId);
    channel?.send({ embeds: [new EmbedBuilder().setDescription('✅ Queue finished! No more songs to play.').setColor('#ED4245')] }).catch(() => {});
    player.destroy();
  });

  client.lavalink.on('playerDisconnect', (player) => player.destroy());

  client.lavalink.on('trackError', (player, track, payload) => {
    const channel = client.channels.cache.get(player.textChannelId);
    const msg = payload?.exception?.message || 'Unknown error';
    console.error('[Lavalink] Track error:', msg);
    channel?.send({ embeds: [new EmbedBuilder().setDescription(`❌ Playback error: \`${msg}\``).setColor('#ED4245')] }).catch(() => {});
  });

  client.lavalink.on('trackStuck', (player) => {
    const channel = client.channels.cache.get(player.textChannelId);
    channel?.send({ embeds: [new EmbedBuilder().setDescription('⚠️ Track got stuck, skipping...').setColor('#FEE75C')] }).catch(() => {});
    player.skip().catch(() => {});
  });

};
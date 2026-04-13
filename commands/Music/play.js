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
  name: 'play',
  aliases: ['p'],
  description: 'Play a song',
  async execute(message, args, cmd, client) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
      return message.channel.send('You must be in a voice channel to use this command.');

    const permissions = voiceChannel.permissionsFor(message.guild.members.me);
    if (!permissions?.has('Connect'))
      return message.channel.send('I do not have permission to join your voice channel.');
    if (!permissions.has('Speak'))
      return message.channel.send('I do not have permission to speak in your voice channel.');
    if (!args.length)
      return message.channel.send('Please provide a song name or URL.');

    if (client.lavalink.nodeManager.nodes.size === 0) {
      return message.channel.send(
        '❌ Lavalink is not connected! Make sure your Lavalink server is running.\n' +
        `Expected: \`${process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT || 2333}\``
      );
    }

    const query = args.join(' ');

    try {
      let player = client.lavalink.getPlayer(message.guild.id);
      if (!player) {
        player = client.lavalink.createPlayer({
          guildId: message.guild.id,
          voiceChannelId: voiceChannel.id,
          textChannelId: message.channel.id,
          selfDeaf: true,
          volume: 100,
        });
      }

      if (!player.connected) await player.connect();

      const searchQuery = query.includes('http') ? query : `ytmsearch:${query}`;
      const res = await player.search({ query: searchQuery }, message.author);

      if (!res || res.loadType === 'empty' || res.loadType === 'error') {
        console.error('[Play] Search failed:', res?.exception || 'No response');
        if (!player.queue.current) player.destroy();
        return message.channel.send('❌ No results found. Try a different search term.');
      }

      const isPlaying = player.playing || player.paused;

      if (res.loadType === 'playlist') {
        await player.queue.add(res.tracks);
        const embed = new EmbedBuilder()
          .setAuthor({ name: '📋 Playlist Added' })
          .setDescription(`Added **${res.tracks.length} songs** from \`${res.playlist?.name || 'playlist'}\` to the queue.`)
          .setColor('#5865F2');
        message.channel.send({ embeds: [embed] });
      } else {
        const track = res.tracks[0];
        await player.queue.add(track);

        if (isPlaying) {
          const embed = new EmbedBuilder()
            .setAuthor({ name: '✅ Added to Queue' })
            .setTitle(track.info.title)
            .setURL(track.info.uri)
            .setThumbnail(track.info.artworkUrl ?? null)
            .addFields(
              { name: '👤 Artist', value: track.info.author || 'Unknown', inline: true },
              { name: '⏱️ Duration', value: `\`${formatDuration(track.info.duration)}\``, inline: true },
            )
            .setColor('#57F287');
          message.channel.send({ embeds: [embed] });
        }
      }

      if (!player.playing && !player.paused) await player.play();
    } catch (err) {
      console.error('[Play] Error:', err);
      message.channel.send(`❌ An error occurred: \`${err.message}\``);
    }
  },
};
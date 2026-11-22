const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'lyrics',
  aliases: ['ly'],
  description: 'Lyrics for the current song (or a song you name)',
  async execute(message, args, cmd, client) {
    const current = client.lavalink.getPlayer(message.guild.id)?.queue.current;
    const query = args.length
      ? args.join(' ')
      : current && `${current.info.author.replace(/ - Topic$/, '')} ${current.info.title.replace(/\(.*?(official|video|audio|lyrics?).*?\)|\[.*?\]/gi, '')}`;
    if (!query) return message.channel.send('There is no song playing. Provide a song name to search for lyrics.');

    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query.trim())}`, {
        headers: { 'User-Agent': 'OctBot (https://github.com/Octille/oct-bot-updated)' },
      });
      const song = (await res.json()).find(s => s.plainLyrics);
      if (!song) return message.channel.send(`No lyrics found for \`${query.trim()}\`.`);

      const lyrics = song.plainLyrics.length > 4000 ? `${song.plainLyrics.slice(0, 4000)}…` : song.plainLyrics;
      message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle(`${song.trackName} — ${song.artistName}`)
        .setDescription(lyrics)
        .setColor('#5865F2')
        .setFooter({ text: 'Lyrics from lrclib.net' })] });
    } catch (err) {
      console.error('[Lyrics] Error:', err);
      message.channel.send('Could not fetch lyrics right now.');
    }
  },
};

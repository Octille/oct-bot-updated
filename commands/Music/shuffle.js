module.exports = {
  name: 'shuffle',
  description: 'Shuffle the queue',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('Nothing is currently playing!');
    if (player.queue.tracks.length < 1)
      return message.channel.send('Need at least 2 songs to shuffle.');
    try {
      player.queue.shuffle();
      message.channel.send('Queue shuffled! 🔀');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};

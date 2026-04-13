module.exports = {
  name: 'stop',
  description: 'Stop the queue and disconnect',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('There is no music playing!');
    try {
      player.queue.tracks.length = 0;
      await player.stopPlaying(true, false);
      player.destroy();
      message.channel.send('Stopped the queue!');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};

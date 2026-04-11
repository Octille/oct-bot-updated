module.exports = {
  name: 'shuffle',
  description: 'Shuffle the queue',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('Nothing is currently playing!');
    if (queue.songs.length < 2) return message.channel.send('Need at least 2 songs to shuffle.');
    try {
      await queue.shuffle();
      message.channel.send('Queue shuffled! \ud83d\udd00');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

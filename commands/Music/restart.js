module.exports = {
  name: 'restart',
  description: 'Restart the current song',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('Nothing is currently playing!');
    try {
      await queue.seek(0);
      message.channel.send('Restarted the song!');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

module.exports = {
  name: 'skip',
  aliases: ['s'],
  description: 'Skip the current song',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('There is no music playing!');
    if (queue.songs.length <= 1) return message.channel.send('There is no next song to skip to.');
    try {
      await queue.skip();
      message.channel.send('Skipped! 👍');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

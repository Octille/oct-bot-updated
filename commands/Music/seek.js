module.exports = {
  name: 'seek',
  description: 'Seek to a timestamp (in seconds)',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('Nothing is currently playing!');
    const time = parseInt(args[0]);
    if (isNaN(time)) return message.channel.send('Please provide a valid timestamp in seconds.');
    try {
      await queue.seek(time);
      message.channel.send(`Seeked to \`${time}s\``);
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

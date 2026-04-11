module.exports = {
  name: 'resume',
  description: 'Resume the queue',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('There is no music playing!');
    if (!queue.paused) return message.channel.send('Queue is not paused.');
    try {
      queue.resume();
      message.channel.send('Queue has been resumed.');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

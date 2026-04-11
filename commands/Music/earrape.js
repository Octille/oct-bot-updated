module.exports = {
  name: 'earrape',
  description: 'Max volume warning',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('There is no music playing!');
    try {
      queue.setVolume(500);
      message.channel.send('\ud83d\udd0a Volume set to maximum (500%)! Use `!volume <number>` to reduce it.');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

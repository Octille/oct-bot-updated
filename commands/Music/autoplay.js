module.exports = {
  name: 'autoplay',
  description: 'Toggle autoplay',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('There is no music playing!');
    try {
      const mode = queue.toggleAutoplay();
      message.channel.send(`Autoplay is now \`${mode ? 'On' : 'Off'}\``);
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

module.exports = {
  name: 'volume',
  aliases: ['vol', 'v'],
  description: 'Set the volume',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('There is no music playing!');
    if (!args[0] || isNaN(args[0]))
      return message.channel.send(`Current volume is \`${queue.volume}%\`. Provide a number to change it.`);
    const volume = parseInt(args[0]);
    if (volume > 500) return message.channel.send('Max volume is 500%.');
    if (volume < 0) return message.channel.send('Min volume is 0%.');
    try {
      queue.setVolume(volume);
      message.channel.send(`Volume set to \`${volume}%\``);
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

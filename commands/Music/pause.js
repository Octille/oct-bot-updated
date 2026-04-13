module.exports = {
  name: 'pause',
  description: 'Pause the current song',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('There is no music playing!');
    if (player.paused) return message.channel.send('Already paused.');
    try {
      await player.pause();
      message.channel.send('Queue has been paused.');
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};

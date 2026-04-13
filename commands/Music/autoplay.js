module.exports = {
  name: 'autoplay',
  description: 'Toggle autoplay (requires a source that supports it)',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('There is no music playing!');
    try {
      const newState = !player.get('autoplay');
      player.set('autoplay', newState);

      // Hook into queueEnd to autoplay a related track
      if (newState) {
        message.channel.send('Autoplay is now `On`');
      } else {
        message.channel.send('Autoplay is now `Off`');
      }
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};

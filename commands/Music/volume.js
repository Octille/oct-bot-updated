module.exports = {
  name: 'volume',
  aliases: ['vol', 'v'],
  description: 'Set the volume (0-500)',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('There is no music playing!');
    if (!args[0] || isNaN(args[0]))
      return message.channel.send(`Current volume is \`${player.volume}%\`. Provide a number to change it.`);
    const vol = parseInt(args[0]);
    if (vol > 500) return message.channel.send('Max volume is 500%.');
    if (vol < 0) return message.channel.send('Min volume is 0%.');
    try {
      await player.setVolume(vol);
      message.channel.send(`Volume set to \`${vol}%\``);
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};

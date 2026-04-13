module.exports = {
  name: 'jump',
  description: 'Jump to a song in the queue by position',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('There is no music playing!');
    const num = parseInt(args[0]);
    if (isNaN(num) || num < 1)
      return message.channel.send('Please provide a valid queue position number (starting at 1).');
    try {
      // Skip (num - 1) tracks to reach position num
      await player.skip(num - 1);
      message.channel.send(`Jumped to song #${num}`);
    } catch {
      message.channel.send(`No song at position \`${args[0]}\` in the queue.`);
    }
  },
};

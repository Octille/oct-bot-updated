const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'jump',
  description: 'Jump to a song in the queue by number',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('There is no music playing!');
    const num = parseInt(args[0]);
    if (isNaN(num)) return message.channel.send('Please provide a valid queue position number.');
    try {
      await queue.jump(num);
      message.channel.send(`Jumped to song #${num}`);
    } catch {
      message.channel.send(`No song at position \`${args[0]}\` in the queue.`);
    }
  }
};

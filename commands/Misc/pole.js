const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'pole',
  description: 'Sets up a poll!',
  async execute(message, args) {
    const pollChannel = message.mentions.channels.first();
    if (!pollChannel) return message.channel.send('Please mention a channel for the poll.');
    const pollDescription = args.slice(1).join(' ');
    if (!pollDescription) return message.channel.send('Please provide a poll description.');
    const embed = new EmbedBuilder()
      .setTitle('New Poll!')
      .setDescription(pollDescription)
      .addFields({ name: 'Author:', value: message.author.toString() })
      .setColor('Yellow');
    const msg = await pollChannel.send({ embeds: [embed] });
    await msg.react('👍');
    await msg.react('👎');
  }
};

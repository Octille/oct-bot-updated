const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'pole',
  aliases: ['poll'],
  description: 'Sets up a 👍 / 👎 poll (optionally in a mentioned channel)',
  async execute(message, args) {
    const pollChannel = message.mentions.channels.first() || message.channel;
    const pollDescription = args.filter(a => !/^<#\d+>$/.test(a)).join(' ');
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

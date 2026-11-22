const { EmbedBuilder } = require('discord.js');
const ms = require('ms');
module.exports = {
  name: 'uptime',
  description: 'How long the bot has been online',
  async execute(message, args, cmd, client) {
    message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle('Uptime')
      .setDescription(`I have been online for **${ms(client.uptime, { long: true })}**`)
      .setFooter({ text: client.user.username })
      .setTimestamp()
      .setColor('Blue')] });
  },
};

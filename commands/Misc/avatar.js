const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'avatar',
  description: "Get a user's avatar",
  aliases: ['av'],
  async execute(message, args) {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`Avatar: ${user.username}`)
      .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setColor('Green');
    message.channel.send({ embeds: [embed] });
  }
};

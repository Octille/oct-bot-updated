const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'invite',
  description: 'Get invite links',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('Hi, I\'m OctBot! Here are all my invite links')
      .setDescription('Invite Oct: **<https://bit.ly/38OiD4C>**\nOct server: https://discord.gg/hE28auh4R5');
    message.channel.send({ embeds: [embed] });
  }
};

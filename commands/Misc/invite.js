const { EmbedBuilder, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'invite',
  description: 'Get invite links',
  async execute(message, args, cmd, client) {
    const invite = client.generateInvite({
      scopes: [OAuth2Scopes.Bot],
      permissions: [PermissionFlagsBits.Administrator],
    });
    const embed = new EmbedBuilder()
      .setTitle('Hi, I\'m OctBot! Here are all my invite links')
      .setDescription(`Invite Oct: **[click here](${invite})**\nOct server: https://discord.gg/hE28auh4R5`);
    message.channel.send({ embeds: [embed] });
  }
};

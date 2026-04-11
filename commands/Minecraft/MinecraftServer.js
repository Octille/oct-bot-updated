const { EmbedBuilder } = require('discord.js');
const { status } = require('minecraft-server-util');
module.exports = {
  name: 'mcserver',
  description: 'Get info about a Minecraft server',
  async execute(message, args) {
    if (!args[0]) return message.channel.send('Please enter a Minecraft server IP.');
    const port = parseInt(args[1]) || 25565;
    try {
      const response = await status(args[0], port);
      const embed = new EmbedBuilder()
        .setColor('#BFCDEB')
        .setTitle('MC Server Status ✅')
        .addFields(
          { name: 'Server IP', value: args[0], inline: true },
          { name: 'Online Players', value: `${response.players.online}`, inline: true },
          { name: 'Max Players', value: `${response.players.max}`, inline: true },
          { name: 'Version', value: response.version?.name || 'Unknown', inline: true }
        );
      message.channel.send({ embeds: [embed] });
    } catch (error) {
      message.channel.send('There was an error finding that server. Make sure the IP and port are correct.');
    }
  }
};

const { EmbedBuilder } = require('discord.js');
const { status } = require('minecraft-server-util');
module.exports = {
  name: 'mcserver',
  aliases: ['mcs'],
  description: 'Get info about a Minecraft server',
  async execute(message, args) {
    if (!args[0]) return message.channel.send('Please enter a Minecraft server IP.');
    const [host, portInIp] = args[0].split(':');
    const port = parseInt(args[1] || portInIp) || 25565;
    try {
      const response = await status(host, port, { timeout: 5000 });
      message.channel.send({ embeds: [new EmbedBuilder()
        .setColor('#BFCDEB')
        .setTitle('MC Server Status ✅')
        .setDescription(response.motd?.clean?.slice(0, 200) || null)
        .addFields(
          { name: 'Server IP', value: args[0], inline: true },
          { name: 'Online Players', value: `${response.players.online}`, inline: true },
          { name: 'Max Players', value: `${response.players.max}`, inline: true },
          { name: 'Version', value: response.version?.name || 'Unknown', inline: true },
          { name: 'Ping', value: `${response.roundTripLatency}ms`, inline: true },
        )] });
    } catch {
      message.channel.send('There was an error finding that server. Make sure the IP and port are correct.');
    }
  },
};

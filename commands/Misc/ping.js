const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'ping',
  description: 'Check bot ping',
  async execute(message, args, cmd, client) {
    const embed = new EmbedBuilder()
      .setTitle("Bot's Ping")
      .setColor('Random')
      .setDescription(`🏓 Latency: ${Date.now() - message.createdTimestamp}ms\n📚 API Latency: ${Math.round(client.ws.ping)}ms`);
    message.channel.send({ embeds: [embed] });
  }
};

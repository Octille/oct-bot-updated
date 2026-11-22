const { EmbedBuilder } = require('discord.js');
const ms = require('ms');
module.exports = {
  name: 'stats',
  aliases: ['botinfo'],
  description: "Show the bot's stats",
  async execute(message, args, cmd, client) {
    const members = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor('Blue')
      .setTitle('My Stats')
      .addFields(
        { name: 'Servers:', value: `\`${client.guilds.cache.size}\``, inline: true },
        { name: 'Members:', value: `\`${members}\``, inline: true },
        { name: 'Commands:', value: `\`${client.commands.size}\``, inline: true },
        { name: 'Uptime:', value: `\`${ms(client.uptime, { long: true })}\``, inline: true },
        { name: 'Ping:', value: `\`${client.ws.ping}ms\``, inline: true },
        { name: 'Online Since:', value: `<t:${Math.floor(client.readyTimestamp / 1000)}:f>`, inline: true },
      )] });
  },
};

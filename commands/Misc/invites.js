const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'invites',
  description: 'Top inviters in this server',
  async execute(message) {
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.channel.send('I need the **Manage Server** permission to see invites.');

    const invites = await message.guild.invites.fetch();
    const counts = {};
    invites.forEach(({ uses, inviter }) => {
      if (inviter) counts[inviter.id] = (counts[inviter.id] || 0) + uses;
    });

    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return message.channel.send('No invites found for this server.');

    const medals = ['🥇', '🥈', '🥉'];
    message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle(`Top inviters in ${message.guild.name}`)
      .setDescription(top.map(([id, n], i) => `${medals[i] || `**${i + 1}.**`} <@${id}> has invited **${n}** member(s)`).join('\n'))
      .setColor('Blue')] });
  },
};

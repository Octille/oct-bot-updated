const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'unmute',
  description: 'Unmutes a member',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.channel.send("You don't have permission.");
    const member = message.mentions.members.first() || await message.guild.members.fetch(args[0] || '0').catch(() => null);
    if (!member) return message.reply('Please provide a member to unmute.');
    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
    if (!role || !member.roles.cache.has(role.id)) return message.channel.send('That member is not muted!');

    await member.roles.remove(role);
    message.channel.send({ embeds: [new EmbedBuilder().setColor('Green').setTitle('Unmuted').setDescription(`${member.user} has now been unmuted.`)] });
    member.send({ embeds: [new EmbedBuilder().setColor('Green').setTitle('Unmuted').setDescription(`You have been unmuted on ${message.guild.name}.`)] }).catch(() => {});
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getMuteRole } = require('../../functions/moderation');
module.exports = {
  name: 'mute',
  description: 'Mutes a member until they are unmuted',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.channel.send("You don't have permission.");
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('I need the **Manage Roles** permission to mute members.');
    const member = message.mentions.members.first() || await message.guild.members.fetch(args[0] || '0').catch(() => null);
    if (!member) return message.reply('Please provide a member to mute.');

    let role = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
    if (!role) {
      message.channel.send('Muted role not found, creating one...');
      role = await getMuteRole(message.guild);
    }
    await member.roles.add(role);

    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor('Green')
      .setTitle('Muted')
      .setDescription(`**Member muted:** ${member.user}\n**Time:** Permanent\n**By:** ${message.author}`)] });
    member.send({ embeds: [new EmbedBuilder()
      .setColor('Red')
      .setTitle('Muted')
      .setDescription(`**Time:** Permanent\n**By:** ${message.author}\n**Server:** ${message.guild.name}`)] }).catch(() => {});
  },
};

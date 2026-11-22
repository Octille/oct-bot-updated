const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { findRole } = require('../../utils');
module.exports = {
  name: 'giverole',
  aliases: ['addrole', 'ar', 'gr'],
  description: 'Give a role to a member',
  async execute(message, args, cmd, client, profileData, settings) {
    return changeRole(message, args, settings, 'add');
  },
  changeRole,
};

async function changeRole(message, args, settings, action) {
  const adding = action === 'add';
  const verb = adding ? 'giverole' : 'removerole';
  if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
    return message.channel.send('You need the **Manage Roles** permission to run this command!');
  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return message.channel.send('I need the **Manage Roles** permission to do that.');

  const member = message.mentions.members.first();
  const roleInput = args.slice(1).join(' ');
  if (!member || !roleInput) {
    return message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle(adding ? 'Add roles to user' : 'Remove roles from user')
      .setDescription(`**How to**\n\`${settings.prefix}${verb} @member <role>\`\n**Example**\n\`${settings.prefix}${verb} @Oct Admin\``)
      .setColor('Random')] });
  }

  const role = message.mentions.roles.first() || findRole(message.guild, roleInput);
  if (!role) {
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('Role not found!').setDescription(`I could not find the role **${roleInput}**`).setColor('Red')] });
  }
  if (role.position >= message.guild.members.me.roles.highest.position)
    return message.channel.send(`I can't manage ${role} because it is higher than (or equal to) my highest role.`);
  if (message.author.id !== message.guild.ownerId && role.position >= message.member.roles.highest.position)
    return message.channel.send(`You can't manage ${role} because it is higher than (or equal to) your highest role.`);

  try {
    await (adding ? member.roles.add(role) : member.roles.remove(role));
    message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle(adding ? 'Role given' : 'Role removed')
      .setDescription(adding ? `${member} has been given the role ${role}` : `${role} has been removed from ${member}`)
      .setColor('Green')] });
  } catch (err) {
    message.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription(err.message).setColor('Red')] });
  }
}

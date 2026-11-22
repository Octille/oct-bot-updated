const { EmbedBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { findRole } = require('../../utils');
module.exports = {
  name: 'roleperms',
  aliases: ['rp'],
  description: 'Add or remove a permission on a role',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.channel.send('You need the **Administrator** permission to run this command!');

    const permName = Object.keys(PermissionFlagsBits).find(p => p.toLowerCase() === args[args.length - 1]?.replace(/_/g, '').toLowerCase());
    const remove = args[0]?.toLowerCase() === 'remove';
    const roleInput = args.slice(remove ? 1 : 0, -1).join(' ');

    if (!roleInput || !permName) {
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('Role permissions')
        .setDescription(`**How to use**\n\`${settings.prefix}roleperms <role> <permission>\`\n\`${settings.prefix}roleperms remove <role> <permission>\`\n\n**Valid permissions**\n${Object.keys(PermissionFlagsBits).map(p => `\`${p}\``).join(' ')}`)] });
    }

    const role = message.mentions.roles.first() || findRole(message.guild, roleInput);
    if (!role) return message.channel.send(`I could not find the role **${roleInput}**`);
    if (!role.editable) return message.channel.send(`I can't edit ${role} because it is higher than my highest role.`);

    const perms = new PermissionsBitField(role.permissions);
    remove ? perms.remove(PermissionFlagsBits[permName]) : perms.add(PermissionFlagsBits[permName]);
    await role.setPermissions(perms, `roleperms by ${message.author.tag}`);
    message.channel.send(`${remove ? 'Removed' : 'Added'} \`${permName}\` ${remove ? 'from' : 'to'} ${role}.`);
  },
};

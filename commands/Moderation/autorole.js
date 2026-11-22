const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
const { findRole, awaitReply } = require('../../utils');
module.exports = {
  name: 'autorole',
  description: 'Give new members a role automatically (run again to disable)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('You need the **Manage Roles** permission to run this command!');
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('I need the **Manage Roles** permission to give roles.');

    if (settings.autoRoleID) {
      await Guild.updateOne({ guildID: message.guild.id }, { $set: { autoRoleID: null } });
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('Auto Role')
        .setDescription('**Successfully reset the auto role on your server!**\nUse this command again to set it up.')
        .setColor('Blue')] });
    }

    let input = args.join(' ');
    if (!input) {
      await message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('Auto Role Setup')
        .setDescription('What role do you want to give to new members? Please provide a role name, mention, or ID.')
        .setColor('Blue')] });
      const reply = await awaitReply(message.channel, message.author);
      if (!reply) return message.channel.send('Setup timed out.');
      input = reply.content;
    }

    const role = findRole(message.guild, input);
    if (!role) return message.channel.send('That is not a valid role! Please try again.');
    if (role.position >= message.guild.members.me.roles.highest.position)
      return message.channel.send(`I can't give ${role} because it is higher than my highest role.`);

    await Guild.updateOne({ guildID: message.guild.id }, { $set: { autoRoleID: role.id } });
    message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle('Auto Role Setup')
      .setDescription(`New members will now get ${role}`)
      .setFooter({ text: 'You can disable auto role by running this command again.' })
      .setColor('Blue')] });
  },
};

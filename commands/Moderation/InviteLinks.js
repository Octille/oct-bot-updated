const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
module.exports = {
  name: 'invitelinks',
  aliases: ['il'],
  description: 'Toggle invite link filtering',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.channel.send('You do not have permission to use this command!');

    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setTitle('Please provide if you want invite links on or off')
        .addFields(
          { name: 'Invites On:', value: `\`${settings.prefix}invitelinks on\`` },
          { name: 'Invites Off:', value: `\`${settings.prefix}invitelinks off\`` }
        );
      return message.channel.send({ embeds: [embed] });
    }
    if (args[0] === 'on') {
      await Guild.findOneAndUpdate({ guildID: message.guild.id }, { $set: { InviteLinks: 1 } });
      return message.channel.send('Invite links are now turned on.');
    }
    if (args[0] === 'off') {
      await Guild.findOneAndUpdate({ guildID: message.guild.id }, { $set: { InviteLinks: 0 } });
      return message.channel.send('Invite links are now turned off.');
    }
  }
};

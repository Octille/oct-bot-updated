const { PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
module.exports = {
  name: 'prefix',
  description: 'Sets a per-server prefix',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.channel.send('You do not have permission to use this command!');
    if (args.length < 1)
      return message.channel.send(`Please specify a prefix! Your current prefix is \`${settings.prefix}\``);
    await Guild.findOneAndUpdate({ guildID: message.guild.id }, { $set: { prefix: args[0] } });
    return message.channel.send(`Your server prefix has been updated to \`${args[0]}\``);
  }
};

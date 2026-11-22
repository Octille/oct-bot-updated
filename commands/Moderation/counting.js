const { PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
module.exports = {
  name: 'counting',
  description: 'Make this channel a counting channel (`counting off` to disable)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.channel.send('You need the **Manage Channels** permission to run this command!');

    if (args[0] === 'off' || args[0] === 'disable') {
      await Guild.updateOne({ guildID: message.guild.id }, { $set: { countingChannelID: null } });
      return message.channel.send('Counting has been disabled.');
    }

    const channel = message.mentions.channels.first() || message.channel;
    const start = parseInt(args.find(a => /^\d+$/.test(a)) || '0');
    await Guild.updateOne({ guildID: message.guild.id }, { $set: { countingChannelID: channel.id, countingNumber: start } });
    message.channel.send(`${channel} is now the counting channel! The next number is **${start + 1}**.\nWrong numbers will be deleted.`);
  },
};

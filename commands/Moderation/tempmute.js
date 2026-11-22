const ms = require('ms');
const { PermissionFlagsBits } = require('discord.js');
const { getMuteRole } = require('../../functions/moderation');
module.exports = {
  name: 'tempmute',
  description: 'Temporarily mutes a member',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.channel.send("You don't have permission.");
    const user = message.mentions.users.first() || message.guild.members.cache.get(args[0]);
    const member = user ? message.guild.members.cache.get(user.id) : null;
    if (!member) return message.reply('Please provide a member to TempMute.');
    const time = args[1];
    if (!time || !ms(time)) return message.reply("You didn't specify a valid time! e.g. `10m`, `1h`");
    const role = await getMuteRole(message.guild);
    await member.roles.add(role);
    message.channel.send(`@${member.user.tag} has been muted for ${ms(ms(time))}`);
    setTimeout(async () => {
      await member.roles.remove(role);
      message.channel.send(`@${member.user.tag} has been unmuted.`);
    }, ms(time));
  }
};

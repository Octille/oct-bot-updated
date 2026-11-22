const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'unban',
  description: 'Unban a user by their ID',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.channel.send(`**${message.author.username}**, you do not have perms to unban someone.`);
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return message.channel.send(`**${message.author.username}**, I do not have perms to unban someone.`);

    const userID = args[0]?.replace(/[<@!>]/g, '');
    if (!userID) {
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setColor('Red')
        .setTitle('User not defined')
        .setDescription('Please provide the user ID of the member you want to unban.\nDon\'t know how to get a user ID? [Click here](https://support.discord.com/hc/en-us/articles/206346498) for more info.')] });
    }

    const ban = await message.guild.bans.fetch(userID).catch(() => null);
    if (!ban) return message.channel.send("That user can't be unbanned since they aren't banned from this server.");

    await message.guild.members.unban(userID);
    message.channel.send({ embeds: [new EmbedBuilder().setColor('Green').setTitle('User unbanned').setDescription(`<@${userID}> has been unbanned.`)] });

    const invite = await message.channel.createInvite({ maxUses: 1 }).catch(() => null);
    ban.user.send({ embeds: [new EmbedBuilder()
      .setTitle('Unbanned')
      .setDescription(`You have been unbanned from \`${message.guild.name}\`.${invite ? `\nYou can join back with this link: ${invite.url}` : ''}`)] }).catch(() => {});
  },
};

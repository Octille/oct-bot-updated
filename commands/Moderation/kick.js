const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'kick',
  description: 'Kicks a member!',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.channel.send('You need permissions to run this command!');
    const user = message.mentions.users.first();
    if (!user) return message.channel.send('You need to mention a member!');
    const reason = args.slice(1).join(' ');
    if (!reason) return message.channel.send('Please specify a reason.');
    const member = message.guild.members.cache.get(user.id);
    if (!member.kickable) return message.channel.send("I can't kick someone with a higher role than me.");
    await member.kick(reason);
    const embed = new EmbedBuilder()
      .setColor('Random')
      .setTitle('Member Kicked')
      .setDescription(`Successfully kicked ${user}\nReason: ${reason}`);
    message.channel.send({ embeds: [embed] });
  }
};

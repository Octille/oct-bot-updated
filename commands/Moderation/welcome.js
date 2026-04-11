const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
module.exports = {
  name: 'welcome',
  aliases: ['wc'],
  description: 'Setup welcome messages',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.channel.send('You do not have permission to use this command!');
    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setTitle('Welcome message')
        .addFields(
          { name: 'Setup:', value: `\`${settings.prefix}welcome setup\`` },
          { name: 'Disable:', value: `\`${settings.prefix}welcome disable\`` }
        );
      return message.channel.send({ embeds: [embed] });
    }
    if (args[0] === 'disable') {
      await Guild.findOneAndUpdate({ guildID: message.guild.id }, { $set: { welcomeID: '0' } });
      return message.channel.send('Welcome messages are now disabled.');
    }
    if (args[0] === 'setup') {
      const idchannel = message.channel.id;
      await Guild.findOneAndUpdate({ guildID: message.guild.id }, { $set: { welcomeID: idchannel } });
      const embed = new EmbedBuilder()
        .setTitle('Welcome channel setup')
        .setDescription(`Channel: <#${idchannel}>`)
        .setFooter({ text: `To disable: ${settings.prefix}welcome disable` });
      return message.channel.send({ embeds: [embed] });
    }
  }
};

const { PermissionOverwriteManager, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'ticket',
  description: 'Open a support ticket!',
  async execute(message, args, cmd, client, profileData, settings) {
    if (message.guild.id !== '460513289558949895')
      return message.channel.send(`Ticket command is only available on the Oct server. Do \`${settings.prefix}invite\` to find the invite link.`);
    if (message.channel.id !== '820435226227638302')
      return message.channel.send('To create a ticket please go to <#820435226227638302>');

    const channel = await message.guild.channels.create({
      name: `ticket-${message.author.username}`,
      parent: '820435321446989824',
      permissionOverwrites: [
        { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ]
    });

    const reactionMessage = await channel.send('Thank you for contacting support!');
    await reactionMessage.react('🔒').catch(() => {});
    await reactionMessage.react('⛔').catch(() => {});

    const collector = reactionMessage.createReactionCollector({
      filter: (reaction, user) => {
        const guildMember = message.guild.members.cache.get(user.id);
        return guildMember && guildMember.permissions.has(PermissionFlagsBits.Administrator);
      },
      dispose: true,
    });

    collector.on('collect', (reaction) => {
      if (reaction.emoji.name === '🔒') {
        channel.permissionOverwrites.edit(message.author.id, { SendMessages: false });
      } else if (reaction.emoji.name === '⛔') {
        channel.send('Deleting this channel in 5 seconds!');
        setTimeout(() => channel.delete().catch(() => {}), 5000);
      }
    });

    const msg = await message.channel.send(`We will be right with you! ${channel}`);
    setTimeout(() => msg.delete().catch(() => {}), 7000);
    setTimeout(() => message.delete().catch(() => {}), 3000);
  }
};

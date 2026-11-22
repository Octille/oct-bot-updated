const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
const { findRole, awaitReply } = require('../../utils');

const ask = (message, text) => message.channel.send({ embeds: [new EmbedBuilder().setTitle('Ticket System Setup').setDescription(text).setColor('Blue')] });

module.exports = {
  name: 'ticketsetup',
  aliases: ['ticket-setup'],
  description: 'Create a 🎟️ reaction ticket panel (run again to reset)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.channel.send('You are missing permissions! You must have the **Manage Server** permission.');
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.channel.send('I need the **Manage Channels** permission to create tickets.');

    if (settings.ticket?.messageID) {
      await Guild.updateOne({ guildID: message.guild.id }, { $set: { 'ticket.messageID': null, 'ticket.roleID': null } });
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('Ticket')
        .setDescription('**Reset the ticket system on your server!**\nUse this command again to set it up.')
        .setColor('Blue')] });
    }

    await ask(message, 'What do you want the embed description to be?');
    let reply = await awaitReply(message.channel, message.author);
    if (!reply) return message.channel.send('Setup timed out.');
    const description = reply.content;

    await ask(message, 'Where do you want to send the message? Please mention a channel.');
    reply = await awaitReply(message.channel, message.author);
    const channel = reply?.mentions.channels.first();
    if (!channel) return message.channel.send('That is not a valid channel! Please try again.');

    await ask(message, 'What role should be able to see tickets? Please provide a role name, mention, or ID.');
    reply = await awaitReply(message.channel, message.author);
    const role = reply && (reply.mentions.roles.first() || findRole(message.guild, reply.content));
    if (!role) return message.channel.send('That is not a valid role! Please try again.');

    const panel = await channel.send({ embeds: [new EmbedBuilder().setTitle('Ticket').setDescription(description).setFooter({ text: 'React with 🎟️ to open a ticket' }).setColor('Blue')] });
    await panel.react('🎟️');

    await Guild.updateOne({ guildID: message.guild.id }, { $set: { 'ticket.messageID': panel.id, 'ticket.roleID': role.id } });
    message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle('Ticket System Setup')
      .setDescription('The setup is now finished!')
      .setFooter({ text: 'Each member will have a 30m cooldown after each ticket.' })
      .setColor('Blue')] });
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ReactionRole = require('../../models/ReactionRole');
const { findRole, awaitReply } = require('../../utils');

const ask = (message, text) => message.channel.send({ embeds: [new EmbedBuilder().setTitle('Reaction Role Setup').setDescription(text).setColor('Blue')] });

module.exports = {
  name: 'reactionroles',
  aliases: ['rr'],
  description: 'Set up a reaction role (`rr list`, `rr remove <messageID>`)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('You need the **Manage Roles** permission to run this command!');
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('I need the **Manage Roles** permission to give roles.');

    if (args[0] === 'list') {
      const all = await ReactionRole.find({ GuildID: message.guild.id });
      if (!all.length) return message.channel.send('No reaction roles set up.');
      const lines = all.map(r => `${/^\d+$/.test(r.Emoji) ? `<:e:${r.Emoji}>` : r.Emoji} → <@&${r.RoleID}> on [message](https://discord.com/channels/${r.GuildID}/${r.ChannelID}/${r.MessageID})`);
      return message.channel.send({ embeds: [new EmbedBuilder().setTitle('Reaction Roles').setDescription(lines.join('\n')).setColor('Blue')] });
    }
    if (args[0] === 'remove') {
      if (!args[1]) return message.channel.send(`Usage: \`${settings.prefix}rr remove <messageID>\``);
      const { deletedCount } = await ReactionRole.deleteMany({ GuildID: message.guild.id, MessageID: args[1] });
      return message.channel.send(`Removed ${deletedCount} reaction role(s) from that message.`);
    }

    await ask(message, 'Where do you want the reaction role? Please mention a channel.\nTIP: use the embed command to make the message.');
    let reply = await awaitReply(message.channel, message.author);
    const channel = reply?.mentions.channels.first();
    if (!channel) return message.channel.send('That is not a valid channel! Please try again.');

    await ask(message, 'Please provide the message ID of the message you want to add the reaction role to.');
    reply = await awaitReply(message.channel, message.author);
    const target = reply && await channel.messages.fetch(reply.content.trim()).catch(() => null);
    if (!target) return message.channel.send(`I couldn't find that message in ${channel}. Please try again.`);

    await ask(message, 'What role do you want to give? Please provide a role name, mention, or ID.');
    reply = await awaitReply(message.channel, message.author);
    const role = reply && (reply.mentions.roles.first() || findRole(message.guild, reply.content));
    if (!role) return message.channel.send('That is not a valid role! Please try again.');
    if (role.position >= message.guild.members.me.roles.highest.position)
      return message.channel.send(`I can't give ${role} because it is higher than my highest role.`);

    await ask(message, 'Please send the emoji you would like me to react with.');
    reply = await awaitReply(message.channel, message.author);
    if (!reply) return message.channel.send('Setup timed out.');
    const raw = reply.content.trim();
    const custom = raw.match(/<a?:\w+:(\d+)>/);

    try {
      await target.react(custom ? custom[1] : raw);
    } catch {
      return message.channel.send("I couldn't react with that emoji. Use a standard emoji or one from this server.");
    }

    await ReactionRole.create({
      GuildID: message.guild.id,
      ChannelID: channel.id,
      MessageID: target.id,
      Emoji: custom ? custom[1] : raw,
      RoleID: role.id,
    });
    ask(message, `The setup is complete! Reacting with ${raw} will now give ${role}.`);
  },
};

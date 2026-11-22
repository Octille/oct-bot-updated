const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Guild = require('../../models/guild');
const ReactionRole = require('../../models/ReactionRole');

const TICKET_EMOJI = '🎟️';
const TICKET_COOLDOWN = 30 * 60 * 1000;
const ticketCooldowns = new Map();

module.exports = async (client, reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }
  const { message } = reaction;
  if (!message.guild) return;

  // Reaction roles
  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  const rr = await ReactionRole.findOne({ GuildID: message.guild.id, MessageID: message.id, Emoji: emojiKey });
  if (rr) {
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.add(rr.RoleID).catch((err) => console.log('Reaction role error:', err.message));
    return;
  }

  // Ticket panel
  const settings = await Guild.findOne({ guildID: message.guild.id });
  if (!settings?.ticket?.messageID || settings.ticket.messageID !== message.id) return;
  if (reaction.emoji.name.replace('️', '') !== TICKET_EMOJI.replace('️', '')) return;

  reaction.users.remove(user.id).catch(() => {});

  const last = ticketCooldowns.get(`${message.guild.id}-${user.id}`);
  if (last && Date.now() - last < TICKET_COOLDOWN) {
    return user.send('Please wait before creating a new ticket! The ticket cooldown is 30 minutes.').catch(() => {});
  }
  ticketCooldowns.set(`${message.guild.id}-${user.id}`, Date.now());

  const updated = await Guild.findOneAndUpdate(
    { guildID: message.guild.id },
    { $inc: { 'ticket.number': 1 } },
    { new: true }
  );
  const number = String(updated.ticket.number).padStart(4, '0');

  const overwrites = [
    { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (settings.ticket.roleID) {
    overwrites.push({ id: settings.ticket.roleID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  const channel = await message.guild.channels.create({
    name: `ticket-${number}`,
    type: ChannelType.GuildText,
    parent: message.channel.parentId || undefined,
    permissionOverwrites: overwrites,
  });

  const embed = new EmbedBuilder()
    .setTitle(`Ticket #${number}`)
    .setDescription(`This ticket was created by ${user}.\nStaff: react 🔒 to lock the ticket for the user, or ⛔ to close it.\nYou can also type \`done\` to close it.`)
    .setColor('Blue');

  const roleMention = settings.ticket.roleID ? ` <@&${settings.ticket.roleID}>` : '';
  const panel = await channel.send({ content: `${user}${roleMention}`, embeds: [embed] });
  await panel.react('🔒').catch(() => {});
  await panel.react('⛔').catch(() => {});

  const close = () => {
    channel.send({ embeds: [new EmbedBuilder().setTitle('Ticket Closed!').setDescription('This channel will be deleted in **5** seconds.').setColor('Blue')] });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  };

  const reactions = panel.createReactionCollector({
    filter: (r, u) => !u.bot && ['🔒', '⛔'].includes(r.emoji.name),
  });
  reactions.on('collect', async (r, u) => {
    const member = await message.guild.members.fetch(u.id).catch(() => null);
    const isStaff = member && (member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      (settings.ticket.roleID && member.roles.cache.has(settings.ticket.roleID)));
    if (!isStaff) return r.users.remove(u.id).catch(() => {});

    if (r.emoji.name === '🔒') {
      await channel.permissionOverwrites.edit(user.id, { SendMessages: false });
      channel.send({ embeds: [new EmbedBuilder().setTitle('Ticket Locked!').setDescription('This channel has been locked for the user.').setColor('Blue')] });
    } else {
      reactions.stop();
      close();
    }
  });

  const messages = channel.createMessageCollector({ filter: (m) => m.content.toLowerCase() === 'done' });
  messages.on('collect', () => {
    messages.stop();
    reactions.stop();
    close();
  });
};

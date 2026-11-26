import {
  ChannelType,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
} from 'discord.js';
import { isValidObjectId } from 'mongoose';
import { defineComponent } from '../framework/types';
import { embed } from '../lib/embeds';
import { UserError } from '../lib/errors';
import { icon, titleIcon } from '../lib/icons';
import { logError } from '../lib/logger';
import { GuildSettings, getGuildSettings } from '../models/GuildSettings';
import { Ticket } from '../models/Ticket';
import { buildTranscript, isTicketStaff, ticketName, ticketRules, ticketWelcome } from '../services/tickets';

const DUPLICATE = 11000;

/** When each server's member list was last fetched (fetching everyone is heavy, so at most every 10 minutes). */
const memberFetches = new Map<string, number>();

/** IDs of the (human) members with the staff role, fetched from Discord (needs the Server Members intent). */
async function staffMembers(guild: Guild, staffRoleId: string | null): Promise<string[] | null> {
  const role = staffRoleId ? guild.roles.cache.get(staffRoleId) : null;
  if (!role) return null;
  if (Date.now() - (memberFetches.get(guild.id) ?? 0) > ticketRules.memberFetchEveryMs) {
    try {
      await guild.members.fetch({ time: 15_000 });
      memberFetches.set(guild.id, Date.now());
    } catch (err) {
      logError('ticket staff fetch', err);
    }
  }
  return [...role.members.filter((m) => !m.user.bot).keys()];
}

/** Opens a ticket: a private thread in the panel's channel, or a private channel next to it. */
async function openTicket(interaction: ButtonInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const settings = await getGuildSettings(guild.id);
  const mode = settings?.tickets?.mode === 'channel' ? 'channel' : 'thread';
  const staffRoleId = settings?.tickets?.staffRoleId ?? null;
  const parent = interaction.channel;
  const me = guild.members.me!;
  if (!parent || parent.type !== ChannelType.GuildText) throw new UserError('Tickets only work from a panel in a normal text channel.');

  // Already has one? (If its thread or channel was deleted by hand, close the record and carry on.)
  const existing = await Ticket.findOne({ guildId: guild.id, ownerId: interaction.user.id, status: 'open' });
  if (existing) {
    // Another click is creating it right now
    if (!existing.channelId && Date.now() - existing.get('createdAt').getTime() < 60_000) {
      await interaction.editReply('Your ticket is being opened, one moment.');
      return;
    }
    const alive = existing.channelId && (guild.channels.cache.get(existing.channelId) ?? await guild.channels.fetch(existing.channelId).catch(() => null));
    if (alive) {
      await interaction.editReply(`You already have an open ticket: <#${existing.channelId}>`);
      return;
    }
    await Ticket.updateOne({ _id: existing._id, status: 'open' }, { $set: { status: 'closed', closedAt: new Date(), closedBy: 'missing' } });
  }

  const need = mode === 'thread'
    ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageThreads]
    : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.SendMessages];
  if (!parent.permissionsFor(me).has(need)) {
    throw new UserError(mode === 'thread'
      ? 'I need Create Private Threads, Send Messages in Threads and Manage Threads in this channel. Ask an admin.'
      : 'I need Manage Channels and Manage Roles to make ticket channels. Ask an admin.');
  }

  const counter = await GuildSettings.findOneAndUpdate({ _id: guild.id }, { $inc: { 'tickets.counter': 1 } }, { upsert: true, new: true, lean: true });
  const number = counter?.tickets?.counter ?? 1;
  let ticket;
  try {
    ticket = await Ticket.create({ guildId: guild.id, ownerId: interaction.user.id, number, mode });
  } catch (err) {
    if ((err as { code?: number }).code === DUPLICATE) {
      await interaction.editReply('Your ticket is already being opened.');
      return;
    }
    throw err;
  }

  let channel: GuildTextBasedChannel | null = null;
  // Channel mode: staff see the channel through its permissions, so the mention just notifies them
  let mentionStaff = !!staffRoleId;
  try {
    const name = ticketName(number, interaction.user.username);
    if (mode === 'thread') {
      const thread = await parent.threads.create({ name, type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 10080, reason: `Ticket #${number}` });
      await thread.members.add(interaction.user.id);
      // Every staff member is added to the thread; a big staff team gets a role mention instead
      const staff = await staffMembers(guild, staffRoleId);
      if (staff && staff.length <= ticketRules.addStaffMax) {
        for (const id of staff) await thread.members.add(id).catch(() => undefined);
        mentionStaff = false;
      }
      channel = thread;
    } else {
      const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
      channel = await guild.channels.create({
        name, type: ChannelType.GuildText, parent: parent.parentId, reason: `Ticket #${number}`,
        permissionOverwrites: [
          { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, type: OverwriteType.Member, allow },
          { id: me.id, type: OverwriteType.Member, allow: [...allow, PermissionFlagsBits.ManageChannels] },
          ...(staffRoleId ? [{ id: staffRoleId, type: OverwriteType.Role, allow }] : []),
        ],
      });
    }
    ticket.channelId = channel.id;
    await ticket.save();
    const pinged = mentionStaff ? staffRoleId : null;
    const welcome = ticketWelcome(String(ticket._id), number, interaction.user.id, pinged);
    await channel.send({ ...welcome, allowedMentions: { users: [interaction.user.id], roles: pinged ? [pinged] : [] } });
    await interaction.editReply(`${icon('success')} Ticket opened: <#${channel.id}>`);
  } catch (err) {
    // Don't leave a half-made ticket behind
    await ticket.deleteOne().catch(() => undefined);
    if (channel) await channel.delete().catch(() => undefined);
    throw err;
  }
}

async function loadTicket(interaction: ButtonInteraction<'cached'>, ticketId: string | undefined) {
  const ticket = ticketId && isValidObjectId(ticketId) ? await Ticket.findOne({ _id: ticketId, guildId: interaction.guildId }).lean() : null;
  if (!ticket) throw new UserError('That ticket no longer exists.');
  const settings = await getGuildSettings(interaction.guildId);
  const staff = isTicketStaff(interaction.member as GuildMember, settings?.tickets?.staffRoleId);
  return { ticket, settings, staff };
}

/** Ticket panel `tk:*:open`, and inside tickets `tk:*:close:<id>` / `tk:*:tr:<id>`. */
export const ticketHandler = defineComponent({
  prefix: 'tk',
  async execute({ interaction, id }) {
    if (!interaction.isButton() || !interaction.inCachedGuild()) return;
    const [action, ticketId] = id.args;
    if (action === 'open') return openTicket(interaction);
    // Answer first: the checks below read the database several times
    if (action === 'tr') await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    else if (action === 'close') await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    else return;

    const { ticket, settings, staff } = await loadTicket(interaction, ticketId);
    const owner = ticket.ownerId === interaction.user.id;
    // Transcripts and closing: only the opener and the staff
    if (!owner && !staff) throw new UserError('Only the person who opened this ticket and the staff can do that.');
    const channel = interaction.channel;
    if (!channel || channel.id !== ticket.channelId) throw new UserError('Use this inside the ticket.');

    if (action === 'tr') {
      const file = await buildTranscript(channel, { server: interaction.guild.name, number: ticket.number, ownerId: ticket.ownerId });
      await interaction.editReply({ content: `Transcript of ticket #${ticket.number}.`, files: [file] });
      return;
    }
    if (action !== 'close') return;

    const closed = await Ticket.findOneAndUpdate({ _id: ticket._id, status: 'open' }, { $set: { status: 'closed', closedAt: new Date(), closedBy: interaction.user.id } });
    if (!closed) throw new UserError('This ticket is already closed.');
    await interaction.editReply(`${icon('success')} Closing the ticket…`);
    await interaction.message.edit({ components: [] }).catch(() => undefined);

    const file = await buildTranscript(channel, { server: interaction.guild.name, number: ticket.number, ownerId: ticket.ownerId }).catch((err) => {
      logError('ticket transcript', err);
      return null;
    });
    // The transcript goes to the mod log (staff only); without one, the person closing gets it privately
    const logChannel = settings?.modLogChannelId ? interaction.guild.channels.cache.get(settings.modLogChannelId) : null;
    let logged = false;
    if (file && logChannel?.isSendable()) {
      logged = await logChannel.send({
        embeds: [embed('moderation').setTitle(`${titleIcon('ticket')} Ticket #${ticket.number} closed`)
          .setDescription(`**Opened by:** <@${ticket.ownerId}>\n**Closed by:** ${interaction.user}`).setTimestamp()],
        files: [file], allowedMentions: { parse: [] },
      }).then(() => true, (err) => {
        logError('ticket log', err);
        return false;
      });
    }
    if (file && !logged) await interaction.followUp({ content: `Transcript of ticket #${ticket.number} (no mod log is set, so it isn't saved anywhere else).`, files: [file], flags: MessageFlags.Ephemeral }).catch(() => undefined);

    const note = `${icon('success')} Ticket closed by ${interaction.user}.`;
    if (ticket.mode === 'thread' && channel.isThread()) {
      await channel.send({ content: note, allowedMentions: { parse: [] } }).catch(() => undefined);
      await channel.setLocked(true).catch(() => undefined);
      await channel.setArchived(true).catch(() => undefined);
    } else {
      await channel.send({ content: `${note} This channel is deleted in a few seconds.`, allowedMentions: { parse: [] } }).catch(() => undefined);
      setTimeout(() => void channel.delete(`Ticket #${ticket.number} closed`).catch((err) => logError('ticket delete', err)), ticketRules.deleteChannelAfterMs).unref();
    }
  },
});

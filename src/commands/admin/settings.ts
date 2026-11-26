import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { dropRules } from '../../content/events';
import { spawnWeekly } from '../../services/raids';
import { announceOpened } from '../../scheduler/events';
import { invalidateAutomod, invalidateDropSettings, messageContentAvailable } from '../../events/messageCreate';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { icon } from '../../lib/icons';
import { UserError } from '../../lib/errors';
import { GuildSettings } from '../../models/GuildSettings';
import { invalidateGambling } from '../../services/gambling';

/** Server settings (admins). Phase 6 turns this into a full dashboard. */
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Server settings (admins)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('gambling').setDescription('Turn gambling games on or off in this server')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Allow gambling here?').setRequired(true)))
    .addSubcommand((s) => s.setName('drops').setDescription('Random coin drops in a chat channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to turn drops on or off in').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('enabled').setDescription('Drops on in that channel?').setRequired(true))
      .addIntegerOption((o) => o.setName('per_hour').setDescription(`At most this many per hour per channel (1–${dropRules.maxPerHour})`).setMinValue(1).setMaxValue(dropRules.maxPerHour)))
    .addSubcommand((s) => s.setName('modlog').setDescription('Where moderation actions are logged')
      .addChannelOption((o) => o.setName('channel').setDescription('Mod-log channel (leave empty to turn it off)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('invitefilter').setDescription('Delete Discord invite links (members with Manage Messages are exempt)')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Filter on?').setRequired(true)))
    .addSubcommand((s) => s.setName('events').setDescription('Weekly boss raids and community goals')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to announce them (leave empty to turn them off)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
  category: 'utility',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('You need the Manage Server permission.');
    const guildId = interaction.guildId!;
    const done = (text: string) => interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} ${text}`)] });
    switch (interaction.options.getSubcommand()) {
      case 'drops': {
        const channel = interaction.options.getChannel('channel', true);
        const enabled = interaction.options.getBoolean('enabled', true);
        const perHour = interaction.options.getInteger('per_hour');
        await GuildSettings.updateOne({ _id: guildId }, {
          ...(enabled ? { $addToSet: { 'drops.channelIds': channel.id } } : { $pull: { 'drops.channelIds': channel.id } }),
          $set: { 'drops.enabled': true, ...(perHour ? { 'drops.perHour': perHour } : {}) },
        }, { upsert: true });
        invalidateDropSettings(guildId);
        return done(enabled
          ? `Drops are on in <#${channel.id}>${perHour ? `, up to ${perHour} an hour` : ''}. They only appear while at least ${dropRules.minChatters} people are chatting there.`
          : `Drops are off in <#${channel.id}>.`);
      }
      case 'modlog': {
        const channel = interaction.options.getChannel('channel');
        await GuildSettings.updateOne({ _id: guildId }, { $set: { modLogChannelId: channel?.id ?? null } }, { upsert: true });
        return done(channel ? `Moderation actions will be logged in <#${channel.id}>.` : 'Mod log off.');
      }
      case 'invitefilter': {
        const enabled = interaction.options.getBoolean('enabled', true);
        await GuildSettings.updateOne({ _id: guildId }, { $set: { 'automod.inviteFilter': enabled } }, { upsert: true });
        invalidateAutomod(guildId);
        if (enabled && !messageContentAvailable()) {
          return done("Saved, but **it won't work yet**: I can't read message text without the Message Content intent (Discord developer portal → Bot → Privileged Gateway Intents).");
        }
        return done(enabled ? 'Invite links will be deleted, including edits that add one (members with Manage Messages, and your vanity link, are exempt).' : 'Invite links are allowed again.');
      }
      case 'events': {
        const channel = interaction.options.getChannel('channel');
        await GuildSettings.updateOne({ _id: guildId }, { $set: { 'events.channelId': channel?.id ?? null } }, { upsert: true });
        if (channel) {
          await spawnWeekly(guildId, channel.id);
          await announceOpened(interaction.client);
        }
        return done(channel
          ? `Boss raids and community goals are on, announced in <#${channel.id}>. A new boss and goal arrive every Monday (this week's goal starts now; a raid only appears Monday–Tuesday). Players use \`/raid\`.`
          : 'Boss raids and community goals are off.');
      }
      default: {
        const enabled = interaction.options.getBoolean('enabled', true);
        await GuildSettings.updateOne({ _id: guildId }, { $set: { gamblingEnabled: enabled } }, { upsert: true });
        invalidateGambling(guildId);
        return done(`Gambling is now **${enabled ? 'on' : 'off'}** in this server.`);
      }
    }
  },
});

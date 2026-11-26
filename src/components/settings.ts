import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
  type ModalActionRowComponentBuilder,
} from 'discord.js';
import { defineComponent, type ComponentInteraction } from '../framework/types';
import { makeId } from '../lib/customId';
import { UserError } from '../lib/errors';
import { icon } from '../lib/icons';
import { dropRules } from '../content/events';
import { GuildSettings, getGuildSettings } from '../models/GuildSettings';
import { invalidateAutomod, invalidateDropSettings, messageContentAvailable } from '../events/messageCreate';
import { invalidateGambling } from '../services/gambling';
import { invalidateLevelSettings } from '../services/levels';
import { spawnWeekly } from '../services/raids';
import { announceOpened } from '../scheduler/events';
import { roleBlocker } from '../services/roles';
import { sendWelcome } from '../services/welcome';
import { ticketPanel } from '../services/tickets';
import { MAX_REWARD_ROLES, MAX_SERVER_LEVEL, isSection, settingsScreen, type Section } from '../ui/settings';

type Update = Record<string, unknown>;

/** Values picked in a select menu (any kind), or [] for buttons. */
function picked(interaction: ComponentInteraction): string[] {
  return interaction.isAnySelectMenu() ? interaction.values : [];
}

/**
 * The /settings dashboard (`st:<owner>:…`). Only the admin who opened it can press it, and the
 * Manage Server permission is checked again on every change.
 */
export const settingsHandler = defineComponent({
  prefix: 'st',
  async execute({ interaction, id, client }) {
    if (!interaction.inCachedGuild()) return;
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) throw new UserError('You need the Manage Server permission.');
    const guild = interaction.guild;
    const owner = interaction.user.id;
    const [first, action, arg] = id.args;
    const show = async (section: Section | 'home', note?: string) => {
      const s = await getGuildSettings(guild.id);
      const view = { ...settingsScreen(section, s!, owner, note), allowedMentions: { parse: [] as [] } };
      if (interaction.isMessageComponent() || (interaction.isModalSubmit() && interaction.isFromMessage())) await interaction.update(view);
      else await interaction.reply(view);
    };

    // Navigation: Back (no section) or the section picker
    if (first === 'nav') {
      const target = action ?? picked(interaction)[0];
      return show(isSection(target) ? target : 'home');
    }
    if (!isSection(first)) return;
    const section = first;
    const save = async (u: Update) => {
      await GuildSettings.updateOne({ _id: guild.id }, u, { upsert: true });
    };
    const done = (text: string) => show(section, `${icon('success')} ${text}`);
    const values = picked(interaction);
    const me = guild.members.me!;
    const safeRole = (roleId: string | undefined) => {
      const r = roleId ? guild.roles.cache.get(roleId) : null;
      if (!r) throw new UserError('That role was deleted.');
      const problem = roleBlocker(r, guild, me, interaction.member as GuildMember);
      if (problem) throw new UserError(problem);
      return r;
    };

    // The modal must be the first response, so nothing slow (no settings read) before it
    if (section === 'rewards' && action === 'addrw' && interaction.isRoleSelectMenu()) {
      const r = safeRole(values[0]);
      await interaction.showModal(new ModalBuilder().setCustomId(makeId('st', owner, 'rewards', 'rwlvl', r.id)).setTitle(`Reward: ${r.name}`.slice(0, 45)).addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(new TextInputBuilder().setCustomId('level')
          .setLabel(`Server level (1–${MAX_SERVER_LEVEL})`).setPlaceholder('10').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
      ));
      return;
    }
    const s = (await getGuildSettings(guild.id))!;

    switch (`${section}:${action}`) {
      case 'general:gamble': {
        const on = !s.gamblingEnabled;
        await save({ $set: { gamblingEnabled: on } });
        invalidateGambling(guild.id);
        return done(`Gambling is ${on ? 'on' : 'off'}.`);
      }

      case 'levels:announce': {
        const where = values[0] as 'same' | 'channel' | 'dm' | 'off';
        if (!['same', 'channel', 'dm', 'off'].includes(where)) return;
        await save({ $set: { 'levels.announce': where } });
        invalidateLevelSettings(guild.id);
        return done(where === 'channel' && !s.levels?.channelId ? 'Now pick the level-up channel below.' : 'Saved where level-up messages go.');
      }
      case 'levels:lvchan': {
        const channelId = values[0] ?? null;
        await save({ $set: { 'levels.channelId': channelId, ...(channelId ? { 'levels.announce': 'channel' } : s.levels?.announce === 'channel' ? { 'levels.announce': 'same' } : {}) } });
        invalidateLevelSettings(guild.id);
        return done(channelId ? `Level-up messages go to <#${channelId}>.` : 'Level-up messages go to the channel the member was chatting in.');
      }
      case 'levels:voice':
      case 'levels:weekend':
      case 'levels:stack': {
        const field = { voice: 'voiceXp', weekend: 'weekendDoubleXp', stack: 'stackRewards' }[action as 'voice' | 'weekend' | 'stack'];
        const on = !(s.levels as Record<string, unknown> | undefined)?.[field];
        await save({ $set: { [`levels.${field}`]: on } });
        invalidateLevelSettings(guild.id);
        return done(`${{ voiceXp: 'Voice XP', weekendDoubleXp: 'Weekend double XP', stackRewards: 'Keeping every reward role' }[field]} ${on ? 'on' : 'off'}.`);
      }

      case 'rewards:rwlvl': {
        if (!interaction.isModalSubmit()) return;
        const level = Number(interaction.fields.getTextInputValue('level').trim());
        if (!Number.isInteger(level) || level < 1 || level > MAX_SERVER_LEVEL) throw new UserError(`The level must be a whole number from 1 to ${MAX_SERVER_LEVEL}.`);
        const r = safeRole(arg);
        const replacing = s.levels?.rewards?.some((x) => x.level === level);
        if ((s.levels?.rewards?.length ?? 0) >= MAX_REWARD_ROLES && !replacing) throw new UserError(`At most ${MAX_REWARD_ROLES} reward roles.`);
        await save({ $pull: { 'levels.rewards': { level } } });
        await save({ $push: { 'levels.rewards': { level, roleId: r.id } } });
        invalidateLevelSettings(guild.id);
        return done(`Members get ${r} at **Server Lv ${level}**.`);
      }
      case 'rewards:delrw': {
        const level = Number(values[0]);
        await save({ $pull: { 'levels.rewards': { level } } });
        invalidateLevelSettings(guild.id);
        return done(`No reward role at level ${level} any more. Members keep roles they already have.`);
      }
      case 'rewards:noxp': {
        await save({ $set: { 'levels.noXpChannelIds': values } });
        invalidateLevelSettings(guild.id);
        return done(values.length ? `No XP in ${values.length} channel${values.length === 1 ? '' : 's'}.` : 'XP counts in every channel.');
      }

      case 'drops:dropch': {
        await save({ $set: { 'drops.channelIds': values, 'drops.enabled': values.length > 0 } });
        invalidateDropSettings(guild.id);
        return done(values.length ? `Drops on in ${values.map((c) => `<#${c}>`).join(' ')}.` : 'Drops off (no channels).');
      }
      case 'drops:perhour': {
        const n = Math.min(dropRules.maxPerHour, Math.max(1, Number(values[0]) || 1));
        await save({ $set: { 'drops.perHour': n } });
        invalidateDropSettings(guild.id);
        return done(`Up to ${n} drops an hour per channel.`);
      }
      case 'drops:drops': {
        const on = !s.drops?.enabled;
        if (on && !s.drops?.channelIds?.length) throw new UserError('Pick at least one drop channel first.');
        await save({ $set: { 'drops.enabled': on } });
        invalidateDropSettings(guild.id);
        return done(`Drops ${on ? 'on' : 'off'}.`);
      }

      case 'events:evch': {
        const channelId = values[0] ?? null;
        await save({ $set: { 'events.channelId': channelId } });
        if (channelId) {
          await spawnWeekly(guild.id, channelId);
          await announceOpened(client);
        }
        return done(channelId ? `Raids and community goals are announced in <#${channelId}>. Players use \`/raid\`.` : 'Raids and community goals are off.');
      }

      case 'welcome:wch': {
        const channelId = values[0] ?? null;
        await save({ $set: { 'welcome.channelId': channelId } });
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        const warn = channel && !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ? ` ${icon('warning')} I can't send messages there yet.` : '';
        return done(channelId ? `New members are welcomed in <#${channelId}>.${warn}` : 'Welcome messages off.');
      }
      case 'welcome:card': {
        const on = s.welcome?.card === false;
        await save({ $set: { 'welcome.card': on } });
        return done(`Welcome card ${on ? 'on' : 'off'}.`);
      }
      case 'welcome:wmsg': {
        if (!interaction.isButton()) return;
        await interaction.showModal(new ModalBuilder().setCustomId(makeId('st', owner, 'welcome', 'wmsgm')).setTitle('Welcome message').addComponents(
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(new TextInputBuilder().setCustomId('message')
            .setLabel('Message ({user} {name} {server} {count})').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)
            .setPlaceholder('Leave empty for the default').setValue(s.welcome?.message ?? '')),
        ));
        return;
      }
      case 'welcome:wmsgm': {
        if (!interaction.isModalSubmit()) return;
        const message = interaction.fields.getTextInputValue('message').trim() || null;
        await save({ $set: { 'welcome.message': message } });
        return done(message ? 'Welcome message saved.' : 'Back to the default welcome message.');
      }
      case 'welcome:wtest': {
        if (!s.welcome?.channelId) throw new UserError('Pick a welcome channel first.');
        await sendWelcome(interaction.member as GuildMember);
        return done(`Sent a test welcome for you in <#${s.welcome.channelId}>.`);
      }

      case 'moderation:modlog': {
        const channelId = values[0] ?? null;
        await save({ $set: { modLogChannelId: channelId } });
        return done(channelId ? `Moderation actions and ticket transcripts are logged in <#${channelId}>.` : 'Mod log off.');
      }
      case 'moderation:invite': {
        const on = !s.automod?.inviteFilter;
        await save({ $set: { 'automod.inviteFilter': on } });
        invalidateAutomod(guild.id);
        if (on && !messageContentAvailable()) return done("Invite filter on, but **it won't work yet**: I can't read message text without the Message Content intent.");
        return done(`Invite filter ${on ? 'on' : 'off'}.`);
      }

      case 'roles:autorole': {
        const roleId = values[0] ?? null;
        if (roleId) safeRole(roleId);
        await save({ $set: { autoRoleId: roleId } });
        return done(roleId ? `New members get <@&${roleId}>.` : 'Autorole off.');
      }

      case 'tickets:tkch': {
        const channelId = values[0] ?? null;
        await save({ $set: { 'tickets.panelChannelId': channelId } });
        return done(channelId ? `Ticket panel channel: <#${channelId}>. Press **Post panel** to post it.` : 'No ticket panel channel.');
      }
      case 'tickets:staff': {
        const roleId = values[0] ?? null;
        await save({ $set: { 'tickets.staffRoleId': roleId } });
        const r = roleId ? guild.roles.cache.get(roleId) : null;
        const warn = r && !r.mentionable && !me.permissions.has(PermissionFlagsBits.MentionEveryone)
          ? ` ${icon('warning')} The role isn't mentionable, so staff I don't know about yet won't be pulled into ticket threads. Make it mentionable, or use channel mode.` : '';
        return done(roleId ? `Staff role: <@&${roleId}>.${warn}` : 'No staff role (only people with Manage Server/Channels/Threads see tickets).');
      }
      case 'tickets:mode': {
        const mode = s.tickets?.mode === 'channel' ? 'thread' : 'channel';
        await save({ $set: { 'tickets.mode': mode } });
        return done(mode === 'channel' ? 'New tickets are private channels next to the panel.' : 'New tickets are private threads in the panel channel.');
      }
      case 'tickets:post': {
        const channel = s.tickets?.panelChannelId ? guild.channels.cache.get(s.tickets.panelChannelId) : null;
        if (!channel?.isSendable()) throw new UserError('Pick the panel channel first.');
        if (!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new UserError(`I can't post in <#${channel.id}>.`);
        await channel.send({ ...ticketPanel(), allowedMentions: { parse: [] } });
        return done(`Posted the ticket panel in <#${channel.id}>.`);
      }
      default:
        return;
    }
  },
});

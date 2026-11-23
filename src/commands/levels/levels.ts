import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, type Guild } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { icon, titleIcon } from '../../lib/icons';
import { UserError } from '../../lib/errors';
import { chatXp, totalServerXpForLevel } from '../../content/levels';
import { GuildSettings } from '../../models/GuildSettings';
import { invalidateLevelSettings, isDoubleXp, levelSettings, setServerLevel } from '../../services/levels';

const MAX_REWARDS = 25;

/** A multiplier target is either a role or a channel/category. */
function mentionOf(guild: Guild, id: string): string {
  return guild.roles.cache.has(id) ? `<@&${id}>` : `<#${id}>`;
}
const MAX_LEVEL = 500;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Set up server levels (admins)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('settings').setDescription('Show this server\'s level settings'))
    .addSubcommand((s) => s.setName('announce').setDescription('Where level-up messages go')
      .addStringOption((o) => o.setName('where').setDescription('Where to post them').setRequired(true).addChoices(
        { name: 'Same channel as the message', value: 'same' },
        { name: 'A set channel', value: 'channel' },
        { name: 'Direct message', value: 'dm' },
        { name: 'Off', value: 'off' },
      ))
      .addChannelOption((o) => o.setName('channel').setDescription('For "A set channel"').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommandGroup((g) => g.setName('reward').setDescription('Roles given at server levels')
      .addSubcommand((s) => s.setName('add').setDescription('Give a role at a level')
        .addIntegerOption((o) => o.setName('level').setDescription('Server level').setRequired(true).setMinValue(1).setMaxValue(MAX_LEVEL))
        .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true)))
      .addSubcommand((s) => s.setName('remove').setDescription('Stop giving the role at a level')
        .addIntegerOption((o) => o.setName('level').setDescription('Server level').setRequired(true).setMinValue(1).setMaxValue(MAX_LEVEL)))
      .addSubcommand((s) => s.setName('stack').setDescription('Keep earlier reward roles, or only the highest')
        .addBooleanOption((o) => o.setName('keep').setDescription('true: keep all earned roles · false: only the highest').setRequired(true))))
    .addSubcommand((s) => s.setName('noxp').setDescription('Turn XP off (or back on) in a channel or category')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel or category').setRequired(true)))
    .addSubcommand((s) => s.setName('multiplier').setDescription('XP multiplier for a role or channel (1 removes it)')
      .addNumberOption((o) => o.setName('value').setDescription(`${chatXp.minMult}–${chatXp.maxMult}`).setRequired(true).setMinValue(chatXp.minMult).setMaxValue(chatXp.maxMult))
      .addRoleOption((o) => o.setName('role').setDescription('Role'))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel or category')))
    .addSubcommand((s) => s.setName('voice').setDescription('Turn voice XP on or off')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Voice XP on?').setRequired(true)))
    .addSubcommand((s) => s.setName('doublexp').setDescription('Double XP for a while, or every weekend')
      .addIntegerOption((o) => o.setName('hours').setDescription('Hours from now (0 ends it)').setMinValue(0).setMaxValue(168))
      .addBooleanOption((o) => o.setName('weekends').setDescription('Double XP every Saturday and Sunday (UTC)')))
    .addSubcommand((s) => s.setName('set').setDescription('Set a member\'s server level')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addIntegerOption((o) => o.setName('level').setDescription('Server level').setRequired(true).setMinValue(0).setMaxValue(MAX_LEVEL))),
  category: 'levels',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('You need the Manage Server permission.');
    const guildId = interaction.guildId!;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const update = async (u: Record<string, unknown>) => {
      await GuildSettings.updateOne({ _id: guildId }, u, { upsert: true });
      invalidateLevelSettings(guildId);
    };
    const done = (text: string) => interaction.editReply({ embeds: [embed('success').setDescription(`${icon('success')} ${text}`)] });

    if (group === 'reward') {
      if (sub === 'add') {
        const level = interaction.options.getInteger('level', true);
        const role = interaction.options.getRole('role', true);
        if (role.managed || role.id === guildId) throw new UserError("That role can't be given out.");
        const me = interaction.guild!.members.me;
        const levels = await levelSettings(guildId);
        if ((levels.rewards?.length ?? 0) >= MAX_REWARDS && !levels.rewards.some((r) => r.level === level)) throw new UserError(`At most ${MAX_REWARDS} reward roles.`);
        await GuildSettings.updateOne({ _id: guildId }, { $pull: { 'levels.rewards': { level } } }, { upsert: true });
        await update({ $push: { 'levels.rewards': { level, roleId: role.id } } });
        const warn = !me?.permissions.has(PermissionFlagsBits.ManageRoles)
          ? `\n${icon('warning')} I need the **Manage Roles** permission to give it.`
          : role.position >= me.roles.highest.position ? `\n${icon('warning')} Move my role above ${role} so I can give it.` : '';
        return done(`Members get ${role} at **Server Lv ${level}**.${warn}`);
      }
      if (sub === 'remove') {
        const level = interaction.options.getInteger('level', true);
        await update({ $pull: { 'levels.rewards': { level } } });
        return done(`No reward role at level ${level} any more. Members keep roles they already have.`);
      }
      const keep = interaction.options.getBoolean('keep', true);
      await update({ $set: { 'levels.stackRewards': keep } });
      return done(keep ? 'Members keep every reward role they earn.' : 'Members keep only their highest reward role.');
    }

    switch (sub) {
      case 'announce': {
        const where = interaction.options.getString('where', true);
        const channel = interaction.options.getChannel('channel');
        if (where === 'channel' && !channel) throw new UserError('Pick the channel too.');
        await update({ $set: { 'levels.announce': where, ...(channel ? { 'levels.channelId': channel.id } : {}) } });
        const text = { same: 'in the channel the member was chatting in', channel: `in <#${channel?.id}>`, dm: 'by direct message', off: 'nowhere (off)' }[where];
        return done(`Level-up messages go ${text}.`);
      }
      case 'noxp': {
        const channel = interaction.options.getChannel('channel', true);
        const levels = await levelSettings(guildId);
        const off = levels.noXpChannelIds?.includes(channel.id);
        await update(off ? { $pull: { 'levels.noXpChannelIds': channel.id } } : { $addToSet: { 'levels.noXpChannelIds': channel.id } });
        return done(off ? `XP is back on in <#${channel.id}>.` : `No XP in <#${channel.id}> any more.`);
      }
      case 'multiplier': {
        const value = interaction.options.getNumber('value', true);
        const target = interaction.options.getRole('role') ?? interaction.options.getChannel('channel');
        if (!target) throw new UserError('Pick a role or a channel.');
        await GuildSettings.updateOne({ _id: guildId }, { $pull: { 'levels.multipliers': { targetId: target.id } } }, { upsert: true });
        if (value !== 1) await update({ $push: { 'levels.multipliers': { targetId: target.id, mult: value } } });
        else invalidateLevelSettings(guildId);
        const mention = mentionOf(interaction.guild!, target.id);
        return done(value === 1 ? `Removed the multiplier for ${mention}.` : `${mention} earns **${value}×** XP. When several apply, the highest counts.`);
      }
      case 'voice': {
        const enabled = interaction.options.getBoolean('enabled', true);
        await update({ $set: { 'levels.voiceXp': enabled } });
        return done(enabled ? `Voice XP on: ${chatXp.voicePerMinute} XP a minute when not alone, muted or deafened.` : 'Voice XP off.');
      }
      case 'doublexp': {
        const hours = interaction.options.getInteger('hours');
        const weekends = interaction.options.getBoolean('weekends');
        if (hours === null && weekends === null) throw new UserError('Give hours, weekends, or both.');
        const set: Record<string, unknown> = {};
        if (hours !== null) set['levels.doubleXpUntil'] = hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null;
        if (weekends !== null) set['levels.weekendDoubleXp'] = weekends;
        await update({ $set: set });
        const parts = [
          hours !== null ? (hours > 0 ? `Double XP for the next **${hours}h**.` : 'Double XP ended.') : null,
          weekends !== null ? (weekends ? 'Double XP every weekend.' : 'No weekend double XP.') : null,
        ];
        return done(parts.filter(Boolean).join(' '));
      }
      case 'set': {
        const user = interaction.options.getUser('user', true);
        const level = interaction.options.getInteger('level', true);
        if (user.bot) throw new UserError("Bots don't earn XP.");
        await setServerLevel(guildId, user.id, level, totalServerXpForLevel(level));
        return done(`${user} is now **Server Lv ${level}**. Reward roles update on their next level-up.`);
      }
      default: {
        const l = await levelSettings(guildId);
        const where = { same: 'Same channel', channel: l.channelId ? `<#${l.channelId}>` : 'A set channel (none picked)', dm: 'Direct message', off: 'Off' }[l.announce];
        const rewards = [...(l.rewards ?? [])].sort((a, b) => a.level - b.level).map((r) => `Lv ${r.level} → <@&${r.roleId}>`);
        const mults = (l.multipliers ?? []).map((m) => `${mentionOf(interaction.guild!, m.targetId)} ${m.mult}×`);
        const e = embed('levels').setTitle(`${titleIcon('rank')} Levels › Settings`).addFields(
          { name: 'Level-up messages', value: where, inline: true },
          { name: 'Voice XP', value: l.voiceXp ? 'On' : 'Off', inline: true },
          { name: 'Double XP', value: [isDoubleXp(l) ? '**Active now**' : 'Not active', l.weekendDoubleXp ? 'every weekend' : null].filter(Boolean).join(' · '), inline: true },
          { name: `Reward roles (${l.stackRewards ? 'kept' : 'highest only'})`, value: rewards.join('\n') || 'None' },
          { name: 'No-XP channels', value: (l.noXpChannelIds ?? []).map((id) => `<#${id}>`).join(' ') || 'None', inline: true },
          { name: 'Multipliers', value: mults.join('\n') || 'None', inline: true },
        ).setFooter({ text: `Chat: ${chatXp.message[0]}–${chatXp.message[1]} XP per message, once a minute · Voice: ${chatXp.voicePerMinute} XP a minute` });
        return interaction.editReply({ embeds: [e], allowedMentions: { parse: [] } });
      }
    }
  },
});

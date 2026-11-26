import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { dropRules } from '../content/events';
import { chatXp } from '../content/levels';
import { makeId } from '../lib/customId';
import { embed } from '../lib/embeds';
import { titleIcon } from '../lib/icons';
import { btn, MAIN, NAV, type Payload, type Row } from './kit';

/**
 * The /settings dashboard: one private screen per section, each a pure function of the server's
 * settings. Custom IDs: `st:<owner>:nav[:<section>]` to move, `st:<owner>:<section>:<action>` to change.
 */
export const SECTIONS = {
  general: { title: 'General', blurb: 'Gambling on or off' },
  levels: { title: 'Levels', blurb: 'Level-up messages, voice XP, double XP' },
  rewards: { title: 'Level rewards & XP rules', blurb: 'Reward roles and no-XP channels' },
  drops: { title: 'Drops', blurb: 'Random coin drops in chat' },
  events: { title: 'Events', blurb: 'Weekly boss raids and community goals' },
  moderation: { title: 'Moderation', blurb: 'Mod log' },
} as const;
export type Section = keyof typeof SECTIONS;
export const isSection = (s: string | undefined): s is Section => !!s && s in SECTIONS;

export const MAX_REWARD_ROLES = 25;
export const MAX_SERVER_LEVEL = 500;
export const MAX_NO_XP_CHANNELS = 25;
export const MAX_DROP_CHANNELS = 10;

/** The settings the dashboard shows (a plain shape, so lean documents and test fixtures both fit). */
export interface Settings {
  levels?: {
    announce?: 'same' | 'channel' | 'dm' | 'off' | null; channelId?: string | null; rewards?: readonly { level: number; roleId: string }[];
    stackRewards?: boolean | null; noXpChannelIds?: readonly string[]; voiceXp?: boolean | null; weekendDoubleXp?: boolean | null;
  } | null;
  drops?: { enabled?: boolean | null; channelIds?: readonly string[]; perHour?: number | null } | null;
  events?: { channelId?: string | null } | null;
  modLogChannelId?: string | null;
  gamblingEnabled?: boolean | null;
}

const rowOf = (...c: MessageActionRowComponentBuilder[]): Row => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(c);
const ch = (id: string | null | undefined) => (id ? `<#${id}>` : 'Not set');
const role = (id: string | null | undefined) => (id ? `<@&${id}>` : 'Not set');
const onOff = (on: boolean | null | undefined) => (on ? 'On' : 'Off');
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

function channelSelect(id: string, placeholder: string, current: string[], max = 1, types: readonly ChannelType[] = TEXT_CHANNELS): ChannelSelectMenuBuilder {
  return new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setChannelTypes(...types)
    .setMinValues(0).setMaxValues(max).setDefaultChannels(current.slice(0, max));
}

const toggle = (id: string, label: string, on: boolean | null | undefined) => btn(id, `${label}: ${on ? 'On' : 'Off'}`, on ? MAIN : NAV);

/** One-line summary per section for the home screen. */
function summary(section: Section, s: Settings): string {
  switch (section) {
    case 'general': return `Gambling ${onOff(s.gamblingEnabled)}`;
    case 'levels': return `Level-ups: ${s.levels?.announce === 'channel' ? ch(s.levels.channelId) : s.levels?.announce ?? 'same'} · voice XP ${onOff(s.levels?.voiceXp)}`;
    case 'rewards': return `${s.levels?.rewards?.length ?? 0} reward roles · ${s.levels?.noXpChannelIds?.length ?? 0} no-XP channels`;
    case 'drops': return s.drops?.enabled && s.drops.channelIds?.length ? `${s.drops.channelIds.length} channels · up to ${s.drops.perHour}/hour` : 'Off';
    case 'events': return s.events?.channelId ? `Announced in ${ch(s.events.channelId)}` : 'Off';
    case 'moderation': return `Mod log ${ch(s.modLogChannelId)}`;
  }
}

export function settingsScreen(section: Section | 'home', s: Settings, owner: string, note?: string): Payload {
  const id = (...args: (string | number)[]) => makeId('st', owner, ...args);
  const back = btn(id('nav'), 'Back', NAV);
  const top = note ? `${note}\n\n` : '';

  if (section === 'home') {
    const picker = new StringSelectMenuBuilder().setCustomId(id('nav')).setPlaceholder('Pick a section').addOptions(
      (Object.keys(SECTIONS) as Section[]).map((k) => ({ label: SECTIONS[k].title, value: k, description: SECTIONS[k].blurb })));
    return {
      embeds: [embed('utility').setTitle(`${titleIcon('settings')} Settings`).setDescription(`${top}${(Object.keys(SECTIONS) as Section[])
        .map((k) => `**${SECTIONS[k].title}** · ${summary(k, s)}`).join('\n')}\n\n-# Pick a section to change it. Only people with Manage Server can.`)],
      components: [rowOf(picker)],
    };
  }

  const e = embed('utility').setTitle(`${titleIcon('settings')} Settings › ${SECTIONS[section].title}`);
  const components: Row[] = [];
  const lines: string[] = [];

  switch (section) {
    case 'general':
      lines.push(`**Gambling:** ${onOff(s.gamblingEnabled)}`, '-# Casino games (coinflip, slots, blackjack…) for everyone in this server.');
      components.push(rowOf(back, toggle(id(section, 'gamble'), 'Gambling', s.gamblingEnabled)));
      break;

    case 'levels': {
      const l = s.levels;
      const where = { same: 'In the channel the member was chatting in', channel: `In ${ch(l?.channelId)}`, dm: 'By direct message', off: 'Off' }[l?.announce ?? 'same'];
      lines.push(
        `**Level-up messages:** ${where}`,
        `**Voice XP:** ${onOff(l?.voiceXp)} (${chatXp.voicePerMinute} XP a minute when not alone, muted or deafened)`,
        `**Double XP every weekend:** ${onOff(l?.weekendDoubleXp)}`,
        `**Reward roles:** ${l?.stackRewards ? 'members keep all of them' : 'members keep only the highest'}`,
        '-# Timed double XP, XP multipliers and setting a member\'s level: `/levels`.',
      );
      components.push(
        rowOf(new StringSelectMenuBuilder().setCustomId(id(section, 'announce')).setPlaceholder('Where level-up messages go').addOptions(
          [['same', 'Same channel'], ['channel', 'A set channel'], ['dm', 'Direct message'], ['off', 'Off']].map(([value, label]) => ({ label: label!, value: value!, default: (l?.announce ?? 'same') === value })))),
        rowOf(channelSelect(id(section, 'lvchan'), 'Level-up channel (for "A set channel")', l?.channelId ? [l.channelId] : [])),
        rowOf(back, toggle(id(section, 'voice'), 'Voice XP', l?.voiceXp), toggle(id(section, 'weekend'), 'Weekend 2×', l?.weekendDoubleXp), toggle(id(section, 'stack'), 'Keep all rewards', l?.stackRewards)),
      );
      break;
    }

    case 'rewards': {
      const rewards = [...(s.levels?.rewards ?? [])].sort((a, b) => a.level - b.level);
      const noXp = s.levels?.noXpChannelIds ?? [];
      lines.push(
        `**Reward roles (${rewards.length}/${MAX_REWARD_ROLES}):**`,
        rewards.length ? rewards.map((r) => `Lv ${r.level} → ${role(r.roleId)}`).join('\n') : 'None',
        `**No-XP channels:** ${noXp.map((c) => `<#${c}>`).join(' ') || 'None'}`,
        '-# Pick a role to add it as a reward (you choose the level next).',
      );
      components.push(rowOf(new RoleSelectMenuBuilder().setCustomId(id(section, 'addrw')).setPlaceholder('Add a reward role…').setMinValues(1).setMaxValues(1)));
      if (rewards.length) {
        components.push(rowOf(new StringSelectMenuBuilder().setCustomId(id(section, 'delrw')).setPlaceholder('Remove a reward role…')
          .addOptions(rewards.slice(0, 25).map((r) => ({ label: `Level ${r.level}`, value: String(r.level), description: `Role ID ${r.roleId}` })))));
      }
      components.push(
        rowOf(channelSelect(id(section, 'noxp'), 'No-XP channels and categories', [...noXp], MAX_NO_XP_CHANNELS,
          [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildForum])),
        rowOf(back),
      );
      break;
    }

    case 'drops': {
      const d = s.drops;
      lines.push(
        `**Drops:** ${onOff(d?.enabled && (d.channelIds?.length ?? 0) > 0)}`,
        `**Channels:** ${d?.channelIds?.map((c) => `<#${c}>`).join(' ') || 'None'}`,
        `**At most:** ${d?.perHour ?? 2} per hour per channel`,
        `-# Drops only appear while at least ${dropRules.minChatters} people are chatting.`,
      );
      components.push(
        rowOf(channelSelect(id(section, 'dropch'), 'Drop channels', [...(d?.channelIds ?? [])], MAX_DROP_CHANNELS, [ChannelType.GuildText])),
        rowOf(new StringSelectMenuBuilder().setCustomId(id(section, 'perhour')).setPlaceholder('Drops per hour').addOptions(
          Array.from({ length: dropRules.maxPerHour }, (_, i) => ({ label: `Up to ${i + 1} per hour`, value: String(i + 1), default: (d?.perHour ?? 2) === i + 1 })))),
        rowOf(back, toggle(id(section, 'drops'), 'Drops', d?.enabled)),
      );
      break;
    }

    case 'events':
      lines.push(`**Announcement channel:** ${ch(s.events?.channelId)}`, '-# A new boss and community goal arrive every Monday. Clear the channel to turn them off.');
      components.push(rowOf(channelSelect(id(section, 'evch'), 'Events channel (clear to turn off)', s.events?.channelId ? [s.events.channelId] : [])), rowOf(back));
      break;

    case 'moderation':
      lines.push(`**Mod log:** ${ch(s.modLogChannelId)}`, '-# Bans, kicks, timeouts, warnings and purges made with OctBot are logged here.');
      components.push(rowOf(channelSelect(id(section, 'modlog'), 'Mod-log channel (clear to turn off)', s.modLogChannelId ? [s.modLogChannelId] : [])), rowOf(back));
      break;
  }
  e.setDescription(`${top}${lines.join('\n')}`.slice(0, 4000));
  return { embeds: [e], components };
}

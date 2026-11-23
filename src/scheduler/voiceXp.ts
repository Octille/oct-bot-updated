import { ChannelType, type Client, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import { announceLevelUp } from '../services/levelAnnounce';
import { awardVoiceXp, levelSettings, xpMultiplier } from '../services/levels';
import type { Job } from './index';

/** Counts toward voice XP: a person who is neither muted nor deafened (by themselves or the server). */
export function voiceEligible(member: Pick<GuildMember, 'user' | 'voice'>): boolean {
  return !member.user.bot && !member.voice.mute && !member.voice.deaf;
}

/** Members of a channel who earn voice XP this minute: only when at least two are eligible. */
export function voiceEarners<M extends Pick<GuildMember, 'user' | 'voice'>>(members: M[]): M[] {
  const eligible = members.filter(voiceEligible);
  return eligible.length >= 2 ? eligible : [];
}

/** Every minute: 10 XP to each eligible person in a voice channel with company (not the AFK channel). */
export const voiceXpJob: Job = {
  name: 'voice-xp',
  schedule: '* * * * *',
  async run(client: Client<true>) {
    for (const guild of client.guilds.cache.values()) {
      const channels = guild.channels.cache.filter((c): c is VoiceBasedChannel =>
        (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.id !== guild.afkChannelId && c.members.size >= 2);
      if (!channels.size) continue;
      const levels = await levelSettings(guild.id);
      if (!levels.voiceXp) continue;
      for (const channel of channels.values()) {
        if (levels.noXpChannelIds?.includes(channel.id)) continue;
        for (const member of voiceEarners([...channel.members.values()])) {
          const mult = xpMultiplier(levels, [channel.id, ...(channel.parentId ? [channel.parentId] : []), ...member.roles.cache.keys()]);
          const up = await awardVoiceXp(guild.id, member.id, mult);
          // Voice channels have their own text chat; announce there when set to "same channel"
          if (up) await announceLevelUp(guild, member, levels, up, channel.isSendable() ? channel : null);
        }
      }
    }
  },
};

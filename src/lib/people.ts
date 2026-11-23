import type { GuildMember, User as DiscordUser } from 'discord.js';
import { getCosmetic } from '../content/cosmetics';
import type { Profile } from '../services/economy';
import type { Person } from './cards';

/** Name, title and avatar for a card. */
export function person(user: DiscordUser, member: GuildMember | null, profile: Partial<Pick<Profile, 'cosmetics'>> | null): Person {
  const title = profile?.cosmetics?.title ? getCosmetic(profile.cosmetics.title) : undefined;
  return {
    name: member?.displayName ?? user.globalName ?? user.username,
    title: title?.kind === 'title' ? String(title.value) : null,
    avatarUrl: (member ?? user).displayAvatarURL({ extension: 'png', size: 256 }),
  };
}

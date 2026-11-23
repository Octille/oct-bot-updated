import { AttachmentBuilder, PermissionFlagsBits, type Guild, type GuildMember, type SendableChannels } from 'discord.js';
import { levelUpCard } from '../lib/cards';
import { cardStyle } from '../lib/theme';
import { getCosmetic } from '../content/cosmetics';
import { logError, logInfo } from '../lib/logger';
import { User } from '../models/User';
import { rewardRoleChanges, type LevelSettings, type ServerLevelUp } from './levels';

/** Discord errors that just mean "we can't do that here"; never worth logging. */
const EXPECTED = new Set([50001, 50007, 50013, 10003, 10007, 10011]);

function expected(err: unknown): boolean {
  return EXPECTED.has((err as { code?: number }).code ?? 0);
}

/** Servers we already logged a permission problem for (logged once, so admins can find it). */
const warned = new Set<string>();
function noteBlocked(guild: Guild, what: string, err: unknown): void {
  const key = `${guild.id}:${what}`;
  if (warned.has(key)) return;
  warned.add(key);
  logInfo('levels', `Can't ${what} in "${guild.name}" (${guild.id}): Discord error ${(err as { code?: number }).code}. Check the bot's permissions.`);
}

/** Adds/removes reward roles. Skips roles the bot can't manage. Returns the roles added. */
export async function applyRewardRoles(member: GuildMember, levels: LevelSettings, up: ServerLevelUp): Promise<string[]> {
  if (!levels.rewards?.length) return [];
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return [];
  const manageable = (id: string) => {
    const role = member.guild.roles.cache.get(id);
    return role && !role.managed && role.position < me.roles.highest.position;
  };
  const { add, remove } = rewardRoleChanges(levels.rewards, up.from, up.to, levels.stackRewards);
  const toAdd = add.filter((id) => manageable(id) && !member.roles.cache.has(id));
  const toRemove = remove.filter((id) => manageable(id) && member.roles.cache.has(id));
  try {
    if (toAdd.length) await member.roles.add(toAdd, `Reached server level ${up.to}`);
    if (toRemove.length) await member.roles.remove(toRemove, `Reached server level ${up.to}`);
  } catch (err) {
    if (expected(err)) noteBlocked(member.guild, 'give reward roles', err);
    else logError('level roles', err);
    return [];
  }
  return toAdd;
}

/**
 * Posts the level-up message (with card) where the server wants it: the channel the member
 * was active in, a set channel, their DMs, or nowhere.
 */
export async function announceLevelUp(guild: Guild, member: GuildMember, levels: LevelSettings, up: ServerLevelUp, here: SendableChannels | null): Promise<void> {
  const roles = await applyRewardRoles(member, levels, up);
  if (levels.announce === 'off') return;

  const profile = await User.findById(member.id, { cosmetics: 1 }, { lean: true });
  const titleId = profile?.cosmetics?.title;
  const title = titleId ? getCosmetic(titleId) : undefined;
  const png = await levelUpCard({
    person: { name: member.displayName, title: title?.kind === 'title' ? String(title.value) : null, avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }) },
    style: cardStyle(profile ?? {}),
    from: up.from,
    to: up.to,
  });
  const rolesText = roles.length ? ` You got ${roles.map((r) => `<@&${r}>`).join(', ')}.` : '';
  const payload = {
    content: levels.announce === 'dm'
      ? `You reached **Server Lv ${up.to}** in **${guild.name}**!${roles.length ? ` You got ${roles.map((r) => guild.roles.cache.get(r)?.name ?? 'a role').join(', ')}.` : ''}`
      : `<@${member.id}> reached **Server Lv ${up.to}**!${rolesText}`,
    files: [new AttachmentBuilder(png, { name: 'level-up.png' })],
    allowedMentions: { users: [member.id], roles: [] },
  };

  try {
    if (levels.announce === 'dm') {
      await member.send(payload);
      return;
    }
    const channel = levels.announce === 'channel' && levels.channelId ? guild.channels.cache.get(levels.channelId) : here;
    if (channel && 'send' in channel && channel.isSendable()) await channel.send(payload);
  } catch (err) {
    if (expected(err)) noteBlocked(guild, levels.announce === 'dm' ? 'DM level-ups' : 'post level-ups', err);
    else logError('level announce', err);
  }
}

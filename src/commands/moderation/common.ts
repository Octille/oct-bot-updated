import { InteractionContextType, type ChatInputCommandInteraction, type GuildMember } from 'discord.js';
import { UserError } from '../../lib/errors';
import { hasPermission, moderationBlocker } from '../../services/moderation';

export const GUILD_ONLY = InteractionContextType.Guild;

/** The moderator, the target member (if in the server) and the bot, after permission checks. */
export async function setup(interaction: ChatInputCommandInteraction, perm: bigint, permName: string, action: string, targetRequired = true) {
  const guild = interaction.guild!;
  const moderator = interaction.member as GuildMember;
  if (!hasPermission(moderator, perm)) throw new UserError(`You need the ${permName} permission.`);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!hasPermission(me, perm)) throw new UserError(`I need the ${permName} permission.`);
  const user = interaction.options.getUser('user', targetRequired);
  const target = user ? await guild.members.fetch(user.id).catch(() => null) : null;
  if (target) {
    const blocked = moderationBlocker(moderator, target, me, action);
    if (blocked) throw new UserError(blocked);
  }
  return { guild, moderator, me, user, target };
}

export const reasonOf = (interaction: ChatInputCommandInteraction) => interaction.options.getString('reason')?.trim() || null;

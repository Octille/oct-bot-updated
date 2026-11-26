import type { GuildMember, PartialGuildMember } from 'discord.js';
import { logError } from '../lib/logger';
import { giveAutorole, sendWelcome } from '../services/welcome';

/** New member: autorole and the welcome message. Needs the Server Members intent. */
export async function onMemberAdd(member: GuildMember): Promise<void> {
  await Promise.all([giveAutorole(member), sendWelcome(member)]).catch((err) => logError('member join', err));
}

/** Passing membership screening: the autorole waits until then. */
export async function onMemberUpdate(old: GuildMember | PartialGuildMember, member: GuildMember): Promise<void> {
  if (old.pending && !member.pending) await giveAutorole(member).catch((err) => logError('autorole', err));
}

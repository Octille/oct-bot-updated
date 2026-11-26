import type { Guild } from 'discord.js';
import { logNotice } from '../lib/logger';

const describe = (g: Guild) => `**${g.name}** (${g.id}, ${g.memberCount} members) · now in ${g.client.guilds.cache.size} servers`;

/** A server added the bot. */
export function onGuildCreate(guild: Guild): void {
  logNotice('server joined', describe(guild));
}

/** A server removed (or banned) the bot. An outage also fires GuildDelete, with `available` false: not a removal. */
export function onGuildDelete(guild: Guild): void {
  if (!guild.available) return;
  logNotice('server left', describe(guild));
}

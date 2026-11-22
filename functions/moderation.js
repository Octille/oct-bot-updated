const { ChannelType } = require('discord.js');

// Finds the server's "Muted" role (any capitalisation), creating it if it doesn't exist
async function getMuteRole(guild) {
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
  if (role) return role;

  role = await guild.roles.create({ name: 'Muted', permissions: [], reason: 'Mute role for Oct Bot' });
  for (const channel of guild.channels.cache.values()) {
    if (![ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildForum].includes(channel.type)) continue;
    await channel.permissionOverwrites.edit(role, {
      SendMessages: false, AddReactions: false, Speak: false,
      SendMessagesInThreads: false, CreatePublicThreads: false,
    }).catch(() => {});
  }
  return role;
}

module.exports = { getMuteRole };

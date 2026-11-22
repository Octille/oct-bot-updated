const ReactionRole = require('../../models/ReactionRole');

module.exports = async (client, reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }
  const { message } = reaction;
  if (!message.guild) return;

  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  const rr = await ReactionRole.findOne({ GuildID: message.guild.id, MessageID: message.id, Emoji: emojiKey });
  if (!rr) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.remove(rr.RoleID).catch((err) => console.log('Reaction role error:', err.message));
};

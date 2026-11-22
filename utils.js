const OWNER_ID = process.env.OWNER_ID || '460509056487129090';

module.exports = {
  OWNER_ID,

  isOwner: (userId) => userId === OWNER_ID,

  // Finds a role from a mention, ID, or (case-insensitive) name
  findRole: function(guild, input = '') {
    const id = input.replace(/[<@&>]/g, '');
    return guild.roles.cache.get(id) ||
      guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase());
  },

  // Waits for the next message from `author` in `channel`; resolves null on timeout
  awaitReply: async function(channel, author, time = 60) {
    const collected = await channel.awaitMessages({
      filter: m => m.author.id === author.id, max: 1, time: time * 1000,
    });
    return collected.first() || null;
  },

  getMember: function(message, toFind = '') {
    toFind = toFind.toLowerCase();
    let target = message.guild.members.cache.get(toFind);
    if (!target && message.mentions.members) target = message.mentions.members.first();
    if (!target && toFind) {
      target = message.guild.members.cache.find(member =>
        member.displayName.toLowerCase().includes(toFind) ||
        member.user.tag.toLowerCase().includes(toFind)
      );
    }
    if (!target) target = message.member;
    return target;
  },

  formatDate: function(date) {
    return new Intl.DateTimeFormat('en-US').format(date);
  },

  promptMessage: async function(message, author, time, validReactions) {
    time *= 1000;
    for (const reaction of validReactions) await message.react(reaction);
    const filter = (reaction, user) => validReactions.includes(reaction.emoji.name) && user.id === author.id;
    return message
      .awaitReactions({ filter, max: 1, time })
      .then(collected => collected.first()?.emoji.name);
  }
};

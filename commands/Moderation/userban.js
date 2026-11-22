const profileModel = require('../../models/profileSchema');
const { isOwner } = require('../../utils');
module.exports = {
  name: 'userban',
  aliases: ['userunban'],
  hidden: true,
  description: 'Owner only: block or unblock a user from using Oct Bot',
  async execute(message, args, cmd) {
    if (!isOwner(message.author.id)) return message.channel.send('Sorry, only the bot owner can run this command 😔');
    const target = message.mentions.users.first();
    if (!target) return message.channel.send(`You need to mention a user to ${cmd === 'userunban' ? 'unban' : 'ban'} them!`);

    const banned = cmd !== 'userunban';
    await profileModel.findOneAndUpdate(
      { userID: target.id },
      { $set: { banned }, $setOnInsert: { serverID: message.guild.id } },
      { upsert: true }
    );
    message.channel.send(banned
      ? `${target} has successfully been banned and can no longer use Oct Bot.`
      : `${target} has successfully been unbanned and can now use Oct Bot.`);
  },
};

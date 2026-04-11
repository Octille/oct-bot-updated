const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'mine',
  cooldown: 60 * 30,
  description: 'Mine some coins',
  async execute(message, args, cmd, client, profileData) {
    if (!profileData.Company?.miners) return message.channel.send("You don't have any miners! Buy one from the company shop with `!company shop`.");
    const k = Math.floor(Math.random() * 5000) + 20000;
    const received = profileData.Company.miners * k;
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: received } });
    message.channel.send(`**${message.author.username}** ran their miners and earned **₪ ${received.toLocaleString()}**!`);
  }
};

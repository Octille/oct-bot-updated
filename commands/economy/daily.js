const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'daily',
  cooldown: 60 * 60 * 24,
  description: 'Claim your daily reward',
  async execute(message, args, cmd, client, profileData) {
    const daily = 7500;
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: daily } });
    return message.channel.send(`**₪ ${daily.toLocaleString()}** were placed in your wallet!`);
  }
};

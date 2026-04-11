const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'rob',
  cooldown: 60,
  description: 'Rob another user',
  async execute(message, args) {
    const mentioned = message.mentions.users.first();
    if (!mentioned) return message.channel.send('Please mention someone to rob.');
    const profileData = await profileModel.findOne({ userID: message.author.id });
    const mentionedProfile = await profileModel.findOne({ userID: mentioned.id });
    if (!mentionedProfile) return message.channel.send('That user has no account.');
    if (profileData.coins < 1000) return message.channel.send(`You need **₪ 1,000** in your wallet to rob someone.`);
    if (mentionedProfile.coins < 1000) return message.channel.send(`${mentioned} needs at least **₪ 1,000** in their wallet.`);
    const d = Math.random();
    const robAmount = Math.floor(mentionedProfile.coins * 0.1);
    if (d < 0.5) {
      await profileModel.findOneAndUpdate({ userID: mentioned.id }, { $inc: { coins: -robAmount } });
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: robAmount } });
      return message.channel.send(`You robbed ${mentioned} for **₪ ${robAmount.toLocaleString()}**!`);
    } else {
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -1000 } });
      await profileModel.findOneAndUpdate({ userID: mentioned.id }, { $inc: { coins: 1000 } });
      return message.channel.send(`You were caught trying to rob ${mentioned} and had to pay them **₪ 1,000**.`);
    }
  }
};

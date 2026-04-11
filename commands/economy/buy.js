const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'buy',
  description: 'Buy items from the shop',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!args[0]) return message.channel.send('Please provide something to buy.');
    const item = args[0].toLowerCase();
    const amount = parseInt(args[1]) || 1;
    if (isNaN(amount) || amount < 1) return message.channel.send('Please provide a valid amount.');

    if (item === 'cookie') {
      const cost = 25 * amount;
      if (cost > profileData.coins) return message.channel.send("You don't have enough coins.");
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -cost, 'Items.Cookies': amount } });
      return message.channel.send(`Successfully bought **${amount}** cookie(s) for **₪ ${cost.toLocaleString()}**`);
    }
    if (item === 'fishingrod') {
      const cost = 10000 * amount;
      if (cost > profileData.coins) return message.channel.send("You don't have enough coins.");
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -cost, 'Items.FishingRod': amount } });
      return message.channel.send(`Successfully bought **${amount}** Fishing Rod(s) for **₪ ${cost.toLocaleString()}**`);
    }
    message.channel.send('That item does not exist. Use `!shop` to see available items.');
  }
};

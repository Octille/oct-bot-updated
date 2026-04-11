const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'deposit',
  aliases: ['dep'],
  description: 'Deposit coins to your bank',
  async execute(message, args, cmd, client, profileData) {
    const coins = profileData.coins;
    const bank = profileData.bank;
    if (args[0] === 'all') {
      if (coins < 1) return message.channel.send('Your wallet is empty!');
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -coins, bank: coins } });
      return message.channel.send(`Successfully deposited **₪ ${coins.toLocaleString()}** to your bank.`);
    }
    const amount = parseInt(args[0]);
    if (isNaN(amount)) return message.channel.send('Please provide a valid amount.');
    if (amount <= 0 || amount % 1 !== 0) return message.channel.send('Deposit amount must be a positive whole number.');
    if (amount > coins) return message.channel.send("You don't have that many coins in your wallet!");
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -amount, bank: amount } });
    return message.channel.send(`Successfully deposited **₪ ${amount.toLocaleString()}** to your bank.`);
  }
};

const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'withdraw',
  aliases: ['with'],
  description: 'Withdraw coins from your bank',
  async execute(message, args, cmd, client, profileData) {
    const bank = profileData.bank;
    const coins = profileData.coins;
    if (args[0] === 'all') {
      if (bank < 1) return message.channel.send("You have 0 coins in your bank!");
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: bank, bank: -bank } });
      return message.channel.send(`Successfully withdrew **₪ ${bank.toLocaleString()}** from your bank.`);
    }
    const amount = parseInt(args[0]);
    if (isNaN(amount)) return message.channel.send('Please provide a valid amount.');
    if (amount <= 0 || amount % 1 !== 0) return message.channel.send('Withdrawal amount must be a positive whole number.');
    if (amount > bank) return message.channel.send("You don't have that many coins in your bank!");
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: amount, bank: -amount } });
    return message.channel.send(`Successfully withdrew **₪ ${amount.toLocaleString()}** from your bank.`);
  }
};

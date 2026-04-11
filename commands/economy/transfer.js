const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'transfer',
  aliases: ['share', 'give'],
  description: 'Transfer coins to another user',
  async execute(message, args, cmd, client, profileData) {
    const mentioned = message.mentions.users.first();
    if (!mentioned) return message.channel.send('Please provide a user to transfer money to.');
    if (mentioned.id === message.author.id) return message.channel.send("You can't transfer to yourself.");
    let amount = Math.floor(parseFloat(args[1]));
    if (!args[1]) return message.channel.send('Please provide an amount to transfer.');
    if (isNaN(amount) || amount <= 0) return message.channel.send('Please provide a valid positive amount.');
    if (amount > profileData.coins) return message.channel.send(`You only have **₪ ${profileData.coins.toLocaleString()}** in your wallet.`);
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -amount } });
    await profileModel.findOneAndUpdate({ userID: mentioned.id }, { $inc: { coins: amount } });
    return message.channel.send(`${message.author} transferred **₪ ${amount.toLocaleString()}** to ${mentioned}.`);
  }
};

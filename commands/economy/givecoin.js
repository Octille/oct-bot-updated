const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'givecoin',
  description: 'Give a player some coins (owner only)',
  async execute(message, args) {
    if (message.member.id !== '460509056487129090') return message.channel.send('Sorry, only **Gurkirat** can run this command.');
    if (!args.length) return message.channel.send('You need to mention a player to give them coins.');
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target) return message.channel.send('That user does not exist.');
    if (isNaN(amount) || amount <= 0) return message.channel.send('Please provide a valid amount.');
    const targetData = await profileModel.findOne({ userID: target.id });
    if (!targetData) return message.channel.send("That user doesn't have an account.");
    await profileModel.findOneAndUpdate({ userID: target.id }, { $inc: { coins: amount } });
    return message.channel.send(`${target} has been given **₪ ${amount.toLocaleString()}**`);
  }
};

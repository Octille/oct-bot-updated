const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  description: 'Double or lose your coins',
  async execute(message, args, cmd, client, profileData) {
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) return message.channel.send('Please provide a valid number to wager.');
    if (profileData.coins < amount) return message.channel.send("You don't have that many coins in your wallet.");
    const win = Math.random() < 0.5;
    const embed = new EmbedBuilder().setTitle('CoinFlip').setColor('Random');
    if (win) {
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: amount } });
      embed.setDescription(`🪙 Tails! You won **₪ ${(amount * 2).toLocaleString()}**!`);
    } else {
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -amount } });
      embed.setDescription(`🪙 Heads! You lost **₪ ${amount.toLocaleString()}**.`);
    }
    message.channel.send({ embeds: [embed] });
  }
};

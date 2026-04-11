const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'balance',
  aliases: ['bal', 'bl'],
  description: 'Check the user balance',
  async execute(message, args) {
    try {
      const user = message.mentions.users.first() || message.author;
      let profileData;
      try {
        profileData = await profileModel.findOne({ userID: message.mentions.users.first().id });
      } catch {
        profileData = await profileModel.findOne({ userID: message.author.id });
      }
      if (!profileData) return message.channel.send('That user has no account.');
      const total = profileData.coins + profileData.bank;
      const embed = new EmbedBuilder()
        .setColor('Random')
        .setAuthor({ name: `${user.username}'s balance`, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setDescription(`Wallet: **₪ ${profileData.coins.toLocaleString()}**\nBank: **₪ ${profileData.bank.toLocaleString()}**\nTotal net worth: **₪ ${total.toLocaleString()}**`);
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.channel.send('You or the person you mentioned doesn\'t have a bank account.');
    }
  }
};

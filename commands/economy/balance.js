const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { xpForLevel, xpBar } = require('../../functions/xp');  // <-- ADD THIS

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
      const level = profileData.level || 1;
      const xp    = profileData.xp    || 0;

      const embed = new EmbedBuilder()
        .setColor('Random')
        .setAuthor({ name: `${user.username}'s balance`, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setDescription(
          `Wallet: **₪ ${profileData.coins.toLocaleString()}**\n` +
          `Bank:   **₪ ${profileData.bank.toLocaleString()}**\n` +
          `Net worth: **₪ ${total.toLocaleString()}**\n\n` +
          `Level **${level}** — ${xpBar(xp, level)}`  // <-- NEW LINE
        );

      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.channel.send("You or the person you mentioned doesn't have a bank account.");
    }
  }
};
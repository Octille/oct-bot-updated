const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'howgay',
  description: 'See how gay someone is',
  async execute(message) {
    const user = message.mentions.users.first() || message.author;
    const hardcoded = { '515341060818337792': 100, '431562938692927488': 100, '554399813655986215': 100, '719249068563628102': 100, '460509056487129090': 0 };
    const percent = hardcoded[user.id] !== undefined ? hardcoded[user.id] : Math.floor(Math.random() * 99) + 1;
    const embed = new EmbedBuilder()
      .setColor('Random')
      .setTitle('Gay-O-Meter 🌈')
      .setDescription(`${user} is **${percent}%** gay 🏳️‍🌈`);
    message.channel.send({ embeds: [embed] });
  }
};

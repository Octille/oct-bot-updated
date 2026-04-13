const { EmbedBuilder } = require('discord.js');
const { promptMessage } = require('../../utils.js');
const choices = ['🗻', '📰', '✂️'];
module.exports = {
  name: 'rockpaperscissors',
  aliases: ['rps'],
  description: 'Rock Paper Scissors',
  async execute(message, args, cmd, client) {
    const embed = new EmbedBuilder()
      .setColor('#ffffff')
      .setDescription('React to play: 🗻 Rock  |  📰 Paper  |  ✂️ Scissors');
    const m = await message.channel.send({ embeds: [embed] });
    const reacted = await promptMessage(m, message.author, 30, choices);
    if (!reacted) return m.edit({ embeds: [embed.setDescription('You did not react in time!')] });
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    let result;
    if (reacted === botChoice) result = "It's a tie!";
    else if (
      (reacted === '🗻' && botChoice === '✂️') ||
      (reacted === '📰' && botChoice === '🗻') ||
      (reacted === '✂️' && botChoice === '📰')
    ) result = 'You won! 🎉';
    else result = 'You lost! 😔';
    m.reactions.removeAll().catch(() => {});
    embed.setDescription('').addFields({ name: result, value: `${reacted} vs ${botChoice}` });
    m.edit({ embeds: [embed] });
  }
};

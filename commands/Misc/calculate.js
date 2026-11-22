const { EmbedBuilder } = require('discord.js');
const math = require('mathjs');
module.exports = {
  name: 'calculate',
  aliases: ['calc', 'math'],
  description: 'Get the answer to a math problem',
  async execute(message, args) {
    if (!args[0]) return message.channel.send('Please provide a question');
    const question = args.join(' ');

    let answer;
    try {
      answer = math.evaluate(question.replace(/(?<=[\d)\s])[x×](?=[\d(\s])/gi, '*').replace(/÷/g, '/'));
    } catch {
      return message.channel.send('Please provide a **valid** question');
    }

    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(0x808080)
      .setTitle('Calculator')
      .addFields(
        { name: 'Question', value: `\`\`\`css\n${question}\`\`\`` },
        { name: 'Answer', value: `\`\`\`css\n${math.format(answer, { precision: 14 })}\`\`\`` },
      )] });
  },
};

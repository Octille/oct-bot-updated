module.exports = {
  name: '8ball',
  description: 'Ask the magic 8ball a question',
  async execute(message, args) {
    if (!args.length) return message.reply('Please ask me a question.');
    const responses = [
      'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.',
      'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.',
      'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
      'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
      "Don't count on it.", 'My reply is no.', 'My sources say no.',
      'Outlook not so good.', 'Very doubtful.', 'No way.', 'Maybe.',
      'The answer is hiding inside you.', 'No.', 'Depends on the mood of the CS god.',
      "It's over.", "It's just the beginning.", 'Good Luck.',
      'Why are you asking an 8ball? The answer is within you.'
    ];
    message.reply(responses[Math.floor(Math.random() * responses.length)]);
  }
};

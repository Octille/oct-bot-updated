module.exports = {
  name: 'googlesearch',
  aliases: ['gs', 'google'],
  description: 'Get a Google search link',
  async execute(message, args) {
    if (!args.length) return message.channel.send('What do you want to search for?');
    message.channel.send(`https://www.google.com/search?q=${encodeURIComponent(args.join(' '))}`);
  },
};

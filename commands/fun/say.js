module.exports = {
  name: 'say',
  description: 'Makes the bot say something',
  async execute(message, args) {
    message.delete().catch(() => {});
    if (!args.length) return message.channel.send('Provide a message to say!');
    const say = args.join(' ');
    if (say.includes('@everyone') || say.includes('@here')) return;
    message.channel.send(say);
  }
};

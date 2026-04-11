module.exports = {
  name: 'hello',
  description: 'Say hello!',
  async execute(message) {
    const messages = ['Hello!', 'Hey!', 'Hi!', 'Good day!'];
    message.channel.send(messages[Math.floor(Math.random() * messages.length)]);
  }
};

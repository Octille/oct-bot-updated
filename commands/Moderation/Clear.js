const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'clear',
  description: 'Clear messages!',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.channel.send('You need permissions to run this command!');
    if (!args[0]) return message.reply('Please enter the amount of messages to clear!');
    if (isNaN(args[0])) return message.reply('Please type a real number!');
    if (args[0] > 100) return message.reply("You can't remove more than 100 messages!");
    if (args[0] < 1) return message.reply('You have to delete at least one message!');

    const messages = await message.channel.messages.fetch({ limit: parseInt(args[0]) });
    const deleted = await message.channel.bulkDelete(messages, true);

    const embed = new EmbedBuilder()
      .setColor('Random')
      .setTitle('Cleared Messages')
      .setDescription(`Successfully deleted ${deleted.size} messages!`);

    const msg = await message.channel.send({ embeds: [embed] });
    setTimeout(() => msg.delete().catch(() => {}), 10000);
  }
};

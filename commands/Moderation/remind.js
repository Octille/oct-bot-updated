const { EmbedBuilder } = require('discord.js');
const ms = require('ms');
module.exports = {
  name: 'remind',
  description: 'Remind yourself of something',
  async execute(message, args) {
    const time = args[0];
    const reminder = args.slice(1).join(' ');
    if (!time) return message.channel.send({ embeds: [new EmbedBuilder().setColor('#F30B04').setDescription('**Please specify the time!**')] });
    if (!['d','m','h','s'].some(u => time.endsWith(u)))
      return message.channel.send({ embeds: [new EmbedBuilder().setColor('#F30B04').setDescription('**I only support d, m, h, or s.**')] });
    if (!reminder) return message.channel.send({ embeds: [new EmbedBuilder().setColor('#F30B04').setDescription('**Please tell me what to remind you of.**')] });
    message.channel.send({ embeds: [new EmbedBuilder().setColor('#33F304').setDescription(`**Your reminder will go off in ${time}**`)] });
    setTimeout(async () => {
      try {
        await message.author.send({ embeds: [new EmbedBuilder().setColor('#7289DA').setTitle('**REMINDER**').setDescription(`It has been ${time}! Here is your reminder: ${reminder}`)] });
      } catch {}
    }, ms(time));
  }
};

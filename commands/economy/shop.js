const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'shop',
  aliases: ['sh'],
  description: 'View the shop',
  async execute(message, args, cmd, client, profileData, settings) {
    const embed = new EmbedBuilder()
      .setTitle('Shop')
      .addFields(
        { name: '🍪 Cookie — **₪ 25**', value: 'This item is cosmetic.' },
        { name: '🎣 Fishing Rod — **₪ 10,000**', value: `Unlocks \`${settings?.prefix || '!'}fish\`` },
        { name: 'Coming soon...', value: 'More items on the way!' }
      )
      .setFooter({ text: 'page 1/1' });
    message.channel.send({ embeds: [embed] });
  }
};

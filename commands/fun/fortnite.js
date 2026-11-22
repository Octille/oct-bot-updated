const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'fortnite',
  aliases: ['ft', 'itemshop'],
  description: "Today's Fortnite item shop",
  async execute(message) {
    try {
      const { data } = await (await fetch('https://fortnite-api.com/v2/shop')).json();
      const items = data.entries
        .filter(e => e.brItems?.length)
        .sort((a, b) => b.finalPrice - a.finalPrice)
        .slice(0, 24);

      const embed = new EmbedBuilder()
        .setTitle('Fortnite Item Shop')
        .setColor('#9d4dbb')
        .setThumbnail(items[0]?.brItems[0].images?.icon || null)
        .setFooter({ text: `${data.entries.length} items in the shop today • fortnite-api.com` })
        .setTimestamp(new Date(data.date));
      for (const e of items) {
        const item = e.brItems[0];
        embed.addFields({ name: e.bundle?.name || item.name, value: `**Rarity:** ${item.rarity?.displayValue || '?'}\n**Price:** ${e.finalPrice} V-Bucks`, inline: true });
      }
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Fortnite] Error:', err);
      message.channel.send('Could not fetch the Fortnite item shop right now.');
    }
  },
};

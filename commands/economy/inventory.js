const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'inventory',
  aliases: ['inv'],
  description: 'View your inventory',
  async execute(message, args) {
    try {
      const user = message.mentions.users.first() || message.author;
      let data;
      try { data = await profileModel.findOne({ userID: message.mentions.users.first().id }); }
      catch { data = await profileModel.findOne({ userID: message.author.id }); }
      if (!data) return message.channel.send('That user has no account.');
      const items = data.Items;
      const lines = [
        items.Shirt ? `👕 Shirt: ${items.Shirt}` : null,
        items.Pants ? `👖 Pants: ${items.Pants}` : null,
        items.Cookies ? `🍪 Cookies: ${items.Cookies}` : null,
        items.FishingRod ? `🎣 Fishing Rod: ${items.FishingRod}` : null,
        items.CommonFish ? `🐟 Common Fish: ${items.CommonFish}` : null,
        items.RareFish ? `🐡 Rare Fish: ${items.RareFish}` : null,
        items.MythicFish ? `🐠 Mythic Fish: ${items.MythicFish}` : null,
      ].filter(Boolean);
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${user.username}'s Inventory`, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setColor('Blue')
        .setDescription(lines.length ? lines.join('\n') : 'Your inventory is empty!');
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.channel.send('That person does not exist in my database.');
    }
  }
};

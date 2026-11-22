const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { applyPrestige } = require('../../functions/economy');
const { awardXP } = require('../../functions/xp');

const LOCATIONS = [
  'car', 'sock', 'milk', 'wallet', 'box', 'pocket', 'bus', 'gutters', 'park', 'train',
  'lounge', 'keyboard', 'picnic', 'bathroom', 'bed', 'sofa', 'backpack', 'laptop', 'oculus', 'shirt',
];

module.exports = {
  name: 'search',
  aliases: ['scout'],
  description: 'Search a location for coins',
  cooldown: 45,
  async execute(message, args, cmd, client, profileData) {
    const choices = [...LOCATIONS].sort(() => Math.random() - 0.5).slice(0, 3);
    const found = applyPrestige(Math.floor(Math.random() * 2401) + 100, profileData?.prestige || 0);

    await message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle(`${message.author.username}, which location would you like to search? 🔍`)
      .setDescription(`Type the location in this channel.\n\`${choices.join('` `')}\``)
      .setFooter({ text: 'You only have 15 seconds to search!' })
      .setColor('Random')] });

    const collected = await message.channel.awaitMessages({
      filter: m => m.author.id === message.author.id && choices.includes(m.content.toLowerCase().trim()),
      max: 1, time: 15000,
    });
    const pick = collected.first();
    if (!pick) {
      return message.channel.send(`What are you doing ${message.author}?! You could have got **₪ ${found.toLocaleString()}** hidden inside the **${choices[0]}**!`);
    }

    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: found } });
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor('Random')
      .setTitle(`${message.author.username} searched the ${pick.content.toLowerCase().trim()}`)
      .setDescription(`${message.author.username} found **₪ ${found.toLocaleString()}**!`)
      .setFooter({ text: 'Nice detective work!' })] });

    await awardXP(message, 'beg');
  },
};

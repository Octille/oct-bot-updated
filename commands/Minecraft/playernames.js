const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
module.exports = {
  name: 'namehistory',
  aliases: ['nh'],
  description: "View a player's Minecraft name history",
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a player name.');
    const fetch = (await import('cross-fetch')).default;
    try {
      const uuidRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${args[0]}`);
      const uuidData = await uuidRes.json();
      if (!uuidData.id) return message.reply('Could not find that player.');
      // Note: Mojang removed the name history API in 2022. This now shows just current name.
      const embed = new EmbedBuilder()
        .setTitle(`${uuidData.name}'s Profile`)
        .setColor(colors.MainColor)
        .setDescription('Note: Mojang removed the name history API in 2022.')
        .addFields({ name: 'Current Name', value: uuidData.name }, { name: 'UUID', value: uuidData.id });
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.channel.send('Could not fetch player data. The Mojang API may be down.');
    }
  }
};

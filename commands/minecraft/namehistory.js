const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getUUID, run } = require('../../functions/hypixel');

module.exports = {
  name: 'namehistory',
  aliases: ['nh', 'mcuser', 'skin'],
  description: "Look up a Minecraft account's UUID and skin",
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a player name.');
    await run(message, async () => {
      const { id, name } = await getUUID(args[0]);
      message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle(`${name}'s Profile`)
        .setColor(colors.MainColor)
        .setThumbnail(`https://mc-heads.net/avatar/${id}`)
        .setImage(`https://mc-heads.net/body/${id}`)
        .setDescription('Note: Mojang removed the name history API in 2022, so only the current name is available.')
        .addFields({ name: 'Current Name', value: name, inline: true }, { name: 'UUID', value: id, inline: true })] });
    });
  },
};

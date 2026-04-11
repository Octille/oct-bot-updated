const weather = require('weather-js');
const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'weather',
  aliases: ['wthr'],
  description: 'Check the weather',
  async execute(message, args) {
    if (!args[0]) return message.channel.send('Please specify a location.');
    weather.find({ search: args.join(' '), degreeType: 'C' }, (error, result) => {
      if (error) return message.channel.send(`Error: ${error}`);
      if (!result || result.length === 0) return message.channel.send('**Invalid** location.');
      const current = result[0].current;
      const location = result[0].location;
      const embed = new EmbedBuilder()
        .setDescription(`**${current.skytext}**`)
        .setAuthor({ name: `Weather forecast for ${current.observationpoint}` })
        .setThumbnail(current.imageUrl)
        .setColor(0x111111)
        .addFields(
          { name: 'Timezone', value: `UTC${location.timezone}`, inline: true },
          { name: 'Degree Type', value: 'Celsius', inline: true },
          { name: 'Temperature', value: `${current.temperature}°`, inline: true },
          { name: 'Wind', value: current.winddisplay, inline: true },
          { name: 'Feels like', value: `${current.feelslike}°`, inline: true },
          { name: 'Humidity', value: `${current.humidity}%`, inline: true }
        );
      message.channel.send({ embeds: [embed] });
    });
  }
};

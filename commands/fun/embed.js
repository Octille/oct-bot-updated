const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'embed',
  description: 'Create a custom embed',
  async execute(message) {
    await message.channel.send('Please provide a **title**:');
    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, max: 2, time: 30000 });
    let title = null;
    collector.on('collect', m => {
      if (title === null) {
        title = m.content;
        message.channel.send(`Title set to \`${title}\`. Now provide a **description**:`);
      } else {
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(m.content)
          .setFooter({ text: `Embed created by ${message.author.username}` });
        message.channel.send({ embeds: [embed] });
        collector.stop();
      }
    });
    collector.on('end', collected => {
      if (collected.size < 2) message.channel.send('Embed creation timed out.');
    });
  }
};

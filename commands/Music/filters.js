const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'filters',
  aliases: ['filter'],
  description: 'Apply audio filters',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) {
      const embed = new EmbedBuilder().setTitle('No music playing').setColor('Blue')
        .setDescription('Play a song first, then use this command.')
        .addFields({ name: 'Available filters:', value: '`3d` `bassboost` `echo` `karaoke` `nightcore` `vaporwave` `flanger` `gate` `haas` `reverse` `surround` `mcompand` `phaser` `tremolo` `earwax`' });
      return message.channel.send({ embeds: [embed] });
    }
    if (!args[0]) return message.channel.send(`Current filter: \`${queue.filters.names.join(', ') || 'Off'}\``);
    if (args[0] === 'off') {
      await queue.filters.clear();
      return message.channel.send('Filters cleared.');
    }
    try {
      await queue.filters.add(args[0]);
      message.channel.send(`Filter \`${args[0]}\` applied!`);
    } catch {
      message.channel.send(`Invalid filter \`${args[0]}\`. Use \`${args[0]}\` from the available list.`);
    }
  }
};

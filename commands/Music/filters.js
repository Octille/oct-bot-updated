const { EmbedBuilder } = require('discord.js');

// Map of friendly filter names -> lavalink-client filter objects
const FILTERS = {
  bassboost: { equalizer: [
    { band: 0, gain: 0.6 }, { band: 1, gain: 0.7 }, { band: 2, gain: 0.8 },
    { band: 3, gain: 0.55 }, { band: 4, gain: 0.25 },
  ]},
  nightcore: { timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 } },
  vaporwave: { timescale: { speed: 0.8, pitch: 0.8, rate: 1.0 } },
  '8d': { rotation: { rotationHz: 0.2 } },
  karaoke: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
  tremolo: { tremolo: { frequency: 2.0, depth: 0.5 } },
  vibrato: { vibrato: { frequency: 2.0, depth: 0.5 } },
};

const FILTER_NAMES = Object.keys(FILTERS).join('` `');

module.exports = {
  name: 'filters',
  aliases: ['filter'],
  description: 'Apply audio filters',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      const embed = new EmbedBuilder()
        .setTitle('No music playing')
        .setColor('Blue')
        .setDescription('Play a song first, then use this command.')
        .addFields({ name: 'Available filters:', value: `\`${FILTER_NAMES}\`` });
      return message.channel.send({ embeds: [embed] });
    }
    if (!args[0]) {
      const active = player.filterManager?.filters ? JSON.stringify(player.filterManager.filters) : 'none';
      return message.channel.send(`Current filters: \`${active}\``);
    }
    if (args[0] === 'off') {
      await player.filterManager.resetFilters();
      return message.channel.send('Filters cleared.');
    }
    const filter = FILTERS[args[0].toLowerCase()];
    if (!filter)
      return message.channel.send(`Invalid filter \`${args[0]}\`. Available: \`${FILTER_NAMES}\``);
    try {
      await player.filterManager.setFilters(filter);
      message.channel.send(`Filter \`${args[0]}\` applied!`);
    } catch (err) {
      message.channel.send(`Error applying filter: ${err.message}`);
    }
  },
};

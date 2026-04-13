const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'loop',
  description: 'Set loop mode (0=off, 1=song, 2=queue)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('Nothing is currently playing!');
    const mode = parseInt(args[0]);
    if (isNaN(mode) || mode < 0 || mode > 2) {
      const prefix = settings?.prefix || '!';
      const embed = new EmbedBuilder()
        .setTitle('Please choose a valid option')
        .setDescription(
          `\`${prefix}loop 0\` — Off\n\`${prefix}loop 1\` — Repeat Song\n\`${prefix}loop 2\` — Repeat Queue`
        );
      return message.channel.send({ embeds: [embed] });
    }
    try {
      // lavalink-client: repeatMode is 'none' | 'track' | 'queue'
      const modeMap = { 0: 'none', 1: 'track', 2: 'queue' };
      player.setRepeatMode(modeMap[mode]);
      const modeText = mode === 0 ? 'Off' : mode === 1 ? 'Repeat Song' : 'Repeat Queue';
      message.channel.send(`Set repeat mode to \`${modeText}\``);
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};

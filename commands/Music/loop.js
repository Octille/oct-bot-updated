const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'loop',
  description: 'Set loop mode (0=off, 1=song, 2=queue)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send('Nothing is currently playing!');
    const mode = parseInt(args[0]);
    if (isNaN(mode) || mode < 0 || mode > 2) {
      const embed = new EmbedBuilder()
        .setTitle('Please choose a valid option')
        .setDescription(`\`${settings?.prefix || '!'}loop 0\` — Off\n\`${settings?.prefix || '!'}loop 1\` — Repeat Song\n\`${settings?.prefix || '!'}loop 2\` — Repeat Queue`);
      return message.channel.send({ embeds: [embed] });
    }
    try {
      queue.setRepeatMode(mode);
      const modeText = mode === 0 ? 'Off' : mode === 1 ? 'Repeat Song' : 'Repeat Queue';
      message.channel.send(`Set repeat mode to \`${modeText}\``);
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  }
};

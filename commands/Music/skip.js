const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'skip',
  aliases: ['s'],
  description: 'Skip the current song',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send('There is no music playing!');

    try {
      if (!player.queue.tracks.length) {
        await player.stopPlaying(true, false);
        player.destroy();
        return message.channel.send({ embeds: [new EmbedBuilder().setDescription('⏭️ Skipped! No more songs in queue, ending session.').setColor('#ae9924')] }).catch(() => {});
      }
      await player.skip();
      message.channel.send({ embeds: [new EmbedBuilder().setDescription('⏭️ Skipped!').setColor('#ae9924')] }).catch(() => {});
    } catch (err) {
      message.channel.send(`Error: ${err.message}`);
    }
  },
};
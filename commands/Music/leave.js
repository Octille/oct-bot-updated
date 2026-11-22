const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'leave',
  aliases: ['disconnect', 'dc'],
  description: 'Leave the voice channel',
  async execute(message, args, cmd, client) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return message.channel.send("I'm not in a voice channel.");
    if (message.member.voice.channelId !== player.voiceChannelId)
      return message.channel.send('**Please join the same voice channel as me to use this command.**');

    const channel = message.guild.channels.cache.get(player.voiceChannelId);
    await player.destroy();
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor(0x2F3136)
      .setTitle('Successfully Left')
      .setDescription(`Channel: ${channel || 'unknown'}`)
      .setFooter({ text: 'Goodbye!' })] });
  },
};

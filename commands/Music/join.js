const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'join',
  aliases: ['connect'],
  description: 'Join your voice channel',
  async execute(message, args, cmd, client) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.channel.send('**You must be in a voice channel to use this command!**');
    if (client.lavalink.nodeManager.nodes.size === 0) return message.channel.send('❌ Lavalink is not connected!');

    let player = client.lavalink.getPlayer(message.guild.id);
    if (player && player.voiceChannelId !== voiceChannel.id && player.queue.current)
      return message.channel.send('I am already playing music in another channel.');
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: message.channel.id,
        selfDeaf: true,
        volume: 100,
      });
    }
    if (!player.connected) await player.connect();
    else if (player.voiceChannelId !== voiceChannel.id) await player.changeVoiceState({ voiceChannelId: voiceChannel.id });

    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor('Blue')
      .setTitle(`Successfully Joined ${voiceChannel.name}`)
      .setDescription(`Channel: ${voiceChannel}\nJoined from: ${message.channel}`)
      .setFooter({ text: 'Try playing some music to unlock all the features!' })] });
  },
};

module.exports = {
  name: 'earrape',
  description: 'Crank the volume to the max (asks first)',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!message.member.voice.channel) return message.channel.send('**You must be in a voice channel to use this command!**');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player?.queue.current) return message.channel.send('There is no music playing!');

    const confirm = await message.channel.send('Are you sure you want to be earraped?');
    await confirm.react('✅');
    await confirm.react('❌');
    const choice = (await confirm.awaitReactions({
      filter: (r, u) => u.id === message.author.id && ['✅', '❌'].includes(r.emoji.name),
      max: 1, time: 15000,
    })).first()?.emoji.name;
    confirm.delete().catch(() => {});

    if (choice !== '✅') return message.channel.send('Earrape operation was cancelled.');
    await player.setVolume(500);
    message.channel.send(`🔊 Volume set to maximum (500%)! Use \`${settings.prefix}volume 100\` to go back to normal.`);
  },
};

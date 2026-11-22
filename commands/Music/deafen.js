const { PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'deafen',
  aliases: ['muteall', 'undeafen', 'unmuteall'],
  description: 'Server-mute everyone in your voice channel (`undeafen` to undo)',
  async execute(message, args, cmd) {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers))
      return message.channel.send('You need the **Mute Members** permission to use this command.');
    const channel = message.member.voice.channel;
    if (!channel) return message.reply('You need to join a voice channel first!');

    const mute = !['undeafen', 'unmuteall'].includes(cmd);
    let changed = 0;
    for (const member of channel.members.values()) {
      if (member.user.bot) continue;
      if (await member.voice.setMute(mute).then(() => true).catch(() => false)) changed++;
    }
    message.channel.send(`${mute ? '🔇 Muted' : '🔊 Unmuted'} **${changed}** member(s) in ${channel}.`);
  },
};

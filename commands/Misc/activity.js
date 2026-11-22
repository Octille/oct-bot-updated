const { EmbedBuilder, InviteTargetType } = require('discord.js');

const ACTIVITIES = {
  youtube:  { id: '880218394199220334', title: 'YouTube Together', color: 'Red' },
  poker:    { id: '755827207812677713', title: 'Poker Night',      color: 'Blue' },
  betrayal: { id: '773336526917861400', title: 'Betrayal',         color: 'LuminousVividPink' },
  fishing:  { id: '814288819477020702', title: 'Fishington',       color: 'DarkAqua' },
};
const ALIASES = { yt: 'youtube' };

module.exports = {
  name: 'activity',
  aliases: ['youtube', 'yt', 'poker', 'betrayal', 'fishing'],
  description: 'Start a Discord activity in your voice channel (youtube, poker, betrayal, fishing)',
  async execute(message, args, cmd, client, profileData, settings) {
    const key = cmd === 'activity' ? (ALIASES[args[0]?.toLowerCase()] || args[0]?.toLowerCase()) : (ALIASES[cmd] || cmd);
    const activity = ACTIVITIES[key];
    if (!activity) return message.channel.send(`Pick an activity: ${Object.keys(ACTIVITIES).map(a => `\`${settings.prefix}${a}\``).join(', ')}`);

    const channel = message.member.voice.channel;
    if (!channel) return message.channel.send('**You must be in a voice channel to use this command!**');

    try {
      const invite = await channel.createInvite({
        maxAge: 86400,
        targetType: InviteTargetType.EmbeddedApplication,
        targetApplication: activity.id,
      });
      message.channel.send({ embeds: [new EmbedBuilder()
        .setColor(activity.color)
        .setTitle(activity.title)
        .setDescription(`[Click here](${invite.url}) to start **${activity.title}** in ${channel}.`)] });
    } catch (err) {
      message.channel.send(`Could not create a ${activity.title} link: ${err.message}`);
    }
  },
};

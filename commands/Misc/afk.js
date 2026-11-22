const Afk = require('../../models/Afk');
module.exports = {
  name: 'afk',
  aliases: ['afkset'],
  description: 'Set your AFK status (cleared when you next talk)',
  async execute(message, args) {
    const reason = args.join(' ') || 'AFK';
    await Afk.findOneAndUpdate(
      { userID: message.author.id, guildID: message.guild.id },
      { reason, since: new Date() },
      { upsert: true }
    );

    const name = message.member.displayName;
    if (!name.startsWith('[AFK] ') && message.member.manageable) {
      await message.member.setNickname(`[AFK] ${name}`.slice(0, 32)).catch(() => {});
    }
    message.reply(`your status has been set to AFK: ${reason}`);
  },
};

const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { xpForLevel, xpBar, TOOLS, streakMultiplier, prestigeMult } = require('../../functions/economy');

module.exports = {
  name: 'rank',
  aliases: ['level', 'lvl', 'xp', 'profile'],
  description: 'View your full profile — level, prestige, streak, mining tool.',

  async execute(message, args, cmd, client, profileData) {
    const user = message.mentions.users.first() || message.author;
    let data;
    try {
      data = message.mentions.users.first()
        ? await profileModel.findOne({ userID: message.mentions.users.first().id })
        : profileData;
    } catch { data = profileData; }

    if (!data) return message.channel.send('That user has no account.');

    const level    = data.level    || 1;
    const xp       = data.xp       || 0;
    const prestige = data.prestige || 0;
    const streak   = data.streak   || 0;

    const titles = [
      [1,'Newcomer'],[5,'Street Rat'],[10,'Hustler'],[15,'Grinder'],
      [20,'Veteran'],[25,'Elite'],[30,'Legend'],[40,'Godlike'],
    ];
    const title = [...titles].reverse().find(([min]) => level >= min)?.[1] || 'Newcomer';

    const tool       = data.Mine?.toolTier >= 0 ? TOOLS[data.Mine.toolTier] : null;
    const workers    = data.Company?.workers || 0;
    const multPct    = Math.round((prestigeMult(prestige) - 1) * 100);
    const smult      = streakMultiplier(streak);

    const embed = new EmbedBuilder()
      .setColor('Random')
      .setAuthor({ name: `${user.username}'s Profile`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .addFields(
        { name: '🏅 Level',      value: `**${level}**`,                      inline: true },
        { name: '🎖️ Title',     value: `**${title}**`,                      inline: true },
        { name: '✨ Prestige',   value: `**${prestige}** (+${multPct}% all)`, inline: true },
        { name: '🔥 Streak',     value: `**${streak}** days (${smult}×)`,    inline: true },
        { name: '⛏️ Tool',      value: tool ? `${tool.emoji} ${tool.name}`  : 'Bare Hands', inline: true },
        { name: '👷 Workers',   value: `**${workers}**`,                     inline: true },
        { name: '📈 XP',        value: xpBar(xp, level),                    inline: false },
      )
      .setFooter({ text: 'Use !mineupgrade, !company, !heist, !prestige to progress' });

    message.channel.send({ embeds: [embed] });
  },
};
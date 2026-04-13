const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  description: 'Server/global leaderboards + around me',

  async execute(message, args, cmd, client) {
    const lowerArgs = args.map(a => a.toLowerCase());

    const isGlobal = lowerArgs.includes('global');
    const isAroundMe = lowerArgs.includes('aroundme');

    const mode =
      lowerArgs.includes('level') ? 'level' :
      lowerArgs.includes('streak') ? 'streak' :
      'wealth';

    const scope = isGlobal ? '🌍 Global' : '🏠 Server';
    let title = `${scope} ${
      mode === 'level'
        ? 'Level'
        : mode === 'streak'
        ? 'Streak'
        : 'Wealth'
    } Leaderboard`;

    let players = await profileModel.find({});

    // ✅ SERVER ONLY = filter to actual current members
    if (!isGlobal) {
      const memberIds = new Set(
        message.guild.members.cache.map(m => m.id)
      );

      players = players.filter(p => memberIds.has(p.userID));
    }

    // ✅ SORTING
    if (mode === 'level') {
      players.sort((a, b) =>
        b.level - a.level || b.xp - a.xp
      );
    }

    else if (mode === 'streak') {
      players.sort((a, b) => b.streak - a.streak);
    }

    else {
      players.sort(
        (a, b) => (b.coins + b.bank) - (a.coins + a.bank)
      );
    }

    if (!players.length) {
      return message.channel.send('No players found.');
    }

    // ✅ around me
    if (isAroundMe) {
      const myIndex = players.findIndex(
        p => p.userID === message.author.id
      );

      if (myIndex === -1) {
        return message.channel.send(
          'You are not ranked on this leaderboard yet.'
        );
      }

      const start = Math.max(0, myIndex - 2);
      const end = Math.min(players.length, myIndex + 3);

      players = players.slice(start, end);
      title += ` — Around ${message.author.username}`;
    } else {
      players = players.slice(0, 10);
    }

    const medals = ['🥇', '🥈', '🥉'];

    const lines = await Promise.all(
      players.map(async (p, i) => {
        const realRank = isAroundMe
          ? getRealRank(players, p, mode)
          : i + 1;

        let username = `User ${p.userID}`;

        try {
          const user = await client.users.fetch(p.userID);
          username = user.username;
        } catch {}

        const prefix =
          !isAroundMe && i < 3
            ? medals[i]
            : `**${realRank}.**`;

        let statText;

        if (mode === 'level') {
          statText = `Level **${p.level || 1}** — ₪ ${(p.coins + p.bank).toLocaleString()}`;
        }

        else if (mode === 'streak') {
          statText = `🔥 **${p.streak || 0}** day streak`;
        }

        else {
          statText = `₪ **${(p.coins + p.bank).toLocaleString()}** | Level **${p.level || 1}**`;
        }

        return `${prefix} **${username}** — ${statText}`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(isGlobal ? '#00bfff' : '#ffd700')
      .setTitle(title)
      .setDescription(lines.join('\n'))
      .setFooter({
        text: '!lb | !lb global | !lb streak | !lb aroundme'
      });

    message.channel.send({ embeds: [embed] });
  },
};

function getRealRank(allPlayers, player) {
  return allPlayers.findIndex(p => p.userID === player.userID) + 1;
}
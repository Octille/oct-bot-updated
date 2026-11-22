const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getPlayer, hypixel, num, networkLevel, run } = require('../../functions/hypixel');

function rankOf(p) {
  if (p.rank && p.rank !== 'NORMAL') return p.rank;
  if (p.monthlyPackageRank === 'SUPERSTAR') return 'MVP++';
  const rank = p.newPackageRank || p.packageRank;
  return rank ? rank.replace('_PLUS', '+') : 'None';
}

module.exports = {
  name: 'player',
  aliases: ['hypixel', 'hp'],
  description: 'Hypixel player profile',
  async execute(message, args) {
    if (!args[0]) return message.reply('Please provide a player name.');
    await run(message, async () => {
      const { name, uuid, player } = await getPlayer(args[0]);
      const [{ session }, { guild }] = await Promise.all([
        hypixel('status', { uuid }).catch(() => ({})),
        hypixel('guild', { player: uuid }).catch(() => ({})),
      ]);
      const ts = (t) => (t ? `<t:${Math.floor(t / 1000)}:R>` : 'Hidden');

      const embed = new EmbedBuilder()
        .setTitle(name)
        .setThumbnail(`https://mc-heads.net/avatar/${uuid}`)
        .setColor(session?.online ? colors.Green : colors.Red)
        .addFields(
          { name: 'Online status', value: session?.online ? '🟢 Online' : '🔴 Offline', inline: true },
          { name: 'Rank', value: rankOf(player), inline: true },
          { name: 'Level', value: `${networkLevel(player.networkExp)}`, inline: true },
          { name: 'Karma', value: num(player.karma), inline: true },
          { name: 'Achievement Points', value: num(player.achievementPoints), inline: true },
          { name: 'Guild', value: guild?.name || 'None', inline: true },
          { name: 'First Login', value: ts(player.firstLogin), inline: true },
          { name: 'Last Login', value: ts(player.lastLogin), inline: true },
          { name: 'Last Game', value: player.mostRecentGameType || 'Unknown', inline: true },
        )
        .setFooter({ text: `UUID: ${uuid}` });
      if (session?.online) {
        embed.addFields({ name: 'Currently playing', value: `**Type:** ${session.gameType}\n**Mode:** ${session.mode || '-'}\n**Map:** ${session.map || '-'}` });
      }
      message.channel.send({ embeds: [embed] });
    });
  },
};

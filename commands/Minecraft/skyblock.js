const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
module.exports = {
  name: 'skyblock',
  aliases: ['sb'],
  description: 'Fetch SkyBlock data',
  async execute(message, args) {
    if (!args.length) return message.channel.send('Specify an argument: `bazaar [item]`, `ah [item]`, `stats [player]`, `skills [player]`');
    const fetch = (await import('cross-fetch')).default;

    if (args[0] === 'bazaar') {
      const item = args.slice(1).join(' ').replace(/ /g, '_').toUpperCase();
      if (!item) return message.channel.send('Please provide an item ID (e.g. `raw_fish`).');
      const msg = await message.channel.send('Fetching...');
      try {
        const res = await fetch(`https://api.slothpixel.me/api/skyblock/bazaar/${item}`);
        const data = await res.json();
        const qs = data.quick_status;
        const embed = new EmbedBuilder()
          .setTitle(`Bazaar: ${item.replace(/_/g, ' ').toLowerCase()}`)
          .setColor(colors.MainColor)
          .addFields(
            { name: 'Buy Price', value: qs.buyPrice.toFixed(1), inline: true },
            { name: 'Sell Price', value: qs.sellPrice.toFixed(1), inline: true }
          );
        msg.edit({ content: '', embeds: [embed] });
      } catch { msg.edit('Could not find that item in the bazaar.'); }
    }

    else if (args[0] === 'ah' || args[0] === 'auctions') {
      const item = args.slice(1).join(' ').replace(/ /g, '_').toUpperCase();
      if (!item) return message.channel.send('Please provide an item ID.');
      const msg = await message.channel.send('Fetching...');
      try {
        const res = await fetch(`https://api.slothpixel.me/api/skyblock/auctions/${item}`);
        const data = await res.json();
        const embed = new EmbedBuilder()
          .setTitle(`Auction House: ${item.replace(/_/g, ' ').toLowerCase()}`)
          .setColor(colors.MainColor)
          .addFields(
            { name: 'Average Price', value: `${data.average_price}`, inline: true },
            { name: 'Median Price', value: `${data.median_price}`, inline: true },
            { name: 'Max Price', value: `${data.max_price}`, inline: true },
            { name: 'Min Price', value: `${data.min_price}`, inline: true }
          );
        msg.edit({ content: '', embeds: [embed] });
      } catch { msg.edit('Could not find that item in the auction house.'); }
    }

    else if (args[0] === 'stats') {
      if (!args[1]) return message.channel.send('Please provide a player name.');
      const msg = await message.channel.send('Fetching...');
      try {
        const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${args[1]}`);
        const mojang = await mojangRes.json();
        const profRes = await fetch(`https://api.slothpixel.me/api/skyblock/profile/${mojang.name}`);
        const profile = await profRes.json();
        const m = profile.members[mojang.id];
        const embed = new EmbedBuilder()
          .setTitle(`${mojang.name}'s SkyBlock Stats`)
          .setColor(colors.MainColor)
          .addFields(
            { name: 'Health', value: `${m.attributes.health?.toFixed(1) || 'N/A'}`, inline: true },
            { name: 'Defense', value: `${m.attributes.defense?.toFixed(1) || 'N/A'}`, inline: true },
            { name: 'Strength', value: `${m.attributes.strength?.toFixed(1) || 'N/A'}`, inline: true },
            { name: 'Speed', value: `${m.attributes.speed?.toFixed(1) || 'N/A'}`, inline: true },
            { name: 'Crit Chance', value: `${m.attributes.crit_chance?.toFixed(1) || 'N/A'}`, inline: true },
            { name: 'Current Purse', value: `${m.coin_purse?.toFixed(1) || 0}`, inline: true }
          );
        msg.edit({ content: '', embeds: [embed] });
      } catch { msg.edit('Could not fetch stats for that player.'); }
    }

    else if (args[0] === 'skills') {
      if (!args[1]) return message.channel.send('Please provide a player name.');
      try {
        const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${args[1].toLowerCase()}`);
        const mojang = await mojangRes.json();
        const profRes = await fetch(`https://api.slothpixel.me/api/skyblock/profile/${mojang.name}`);
        const profile = await profRes.json();
        const skills = profile.members[mojang.id].skills;
        const embed = new EmbedBuilder().setTitle(`Skills of ${mojang.name}`).setColor(colors.MainColor);
        for (const key in skills) {
          const s = skills[key];
          embed.addFields({ name: key, value: `Level: ${s.level} | XP: ${s.xpCurrent} | Next: ${s.xpForNext ?? 'MAXED'}`, inline: true });
        }
        message.channel.send({ embeds: [embed] });
      } catch { message.channel.send('Could not fetch skills for that player.'); }
    }

    else {
      message.channel.send('Unknown subcommand. Use: `bazaar`, `ah`, `stats`, or `skills`.');
    }
  }
};

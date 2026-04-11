const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'company',
  aliases: ['comp', 'c'],
  description: 'Manage your company',
  async execute(message, args, cmd, client, profileData) {
    const user = message.mentions.users.first() || message.author;
    let targetData;
    try { targetData = await profileModel.findOne({ userID: user.id }); }
    catch { targetData = profileData; }
    if (!targetData) return message.channel.send('That user has no account.');

    const miners = targetData.Company?.miners || 0;
    const workers = targetData.Company?.workers || 0;
    const myMiners = profileData.Company?.miners || 0;
    const myWorkers = profileData.Company?.workers || 0;

    const minerCost = myMiners < 3 ? 500000 : myMiners < 7 ? 1000000 : myMiners < 10 ? 1250000 : 1500000;
    const workerCost = myWorkers < 3 ? 150000 : myWorkers < 7 ? 250000 : myWorkers < 10 ? 500000 : 1000000;
    const hourly = workers * 15000;

    if (args[0] === 'shop') {
      const embed = new EmbedBuilder().setColor('#6b32a8').setTitle('Company Shop')
        .addFields(
          { name: `⛏️ Miners — ₪ ${minerCost.toLocaleString()}`, value: 'Makes money with `!mine`' },
          { name: `👷 Workers — ₪ ${workerCost.toLocaleString()}`, value: 'Increases hourly pay' }
        )
        .setFooter({ text: 'Prices increase as you buy more.\n!company buy (item)' });
      return message.channel.send({ embeds: [embed] });
    }

    if (args[0] === 'buy') {
      if (!args[1]) return message.channel.send('Please provide something to buy: `miner` or `worker`');
      const amount = parseInt(args[2]) || 1;
      if (args[1] === 'miner') {
        const cost = minerCost * amount;
        if (cost > profileData.coins) return message.channel.send("You don't have enough coins.");
        await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -cost, 'Company.miners': amount } });
        return message.channel.send(`Bought **${amount}** miner(s) for **₪ ${cost.toLocaleString()}**`);
      }
      if (args[1] === 'worker') {
        const cost = workerCost * amount;
        if (cost > profileData.coins) return message.channel.send("You don't have enough coins.");
        await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -cost, 'Company.workers': amount } });
        return message.channel.send(`Bought **${amount}** worker(s) for **₪ ${cost.toLocaleString()}**`);
      }
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${user.username}'s Company`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .addFields(
        { name: '⛏️ Miners', value: miners.toLocaleString(), inline: true },
        { name: '💵 Hourly', value: `₪ ${hourly.toLocaleString()}`, inline: true },
        { name: '👷 Workers', value: workers.toLocaleString(), inline: true },
        { name: '⚡ Bills', value: '₪ 0', inline: true }
      )
      .setFooter({ text: 'Buy from the shop with !company shop' });
    message.channel.send({ embeds: [embed] });
  }
};

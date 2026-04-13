const profileModel = require('../../models/profileSchema');
const { FISH_PRICES, applyPrestige, awardXP } = require('../../functions/economy');

module.exports = {
  name: 'sell',
  description: 'Sell items from your inventory. Usage: `!sell fish` or `!sell all`',

  async execute(message, args, cmd, client, profileData) {
    const sub = args[0]?.toLowerCase();

    if (!sub || (!['fish', 'all'].includes(sub))) {
      return message.channel.send(
        '**!sell fish** — sell all fish in your inventory\n' +
        '**!sell all** — sell everything sellable'
      );
    }

    const items    = profileData.Items || {};
    const prestige = profileData.prestige || 0;

    // Build sell list
    const toSell = [];
    if (items.CommonFish > 0) toSell.push({ key: 'CommonFish', count: items.CommonFish, emoji: '🐟', label: 'Common Fish' });
    if (items.RareFish   > 0) toSell.push({ key: 'RareFish',   count: items.RareFish,   emoji: '🐡', label: 'Rare Fish'   });
    if (items.MythicFish > 0) toSell.push({ key: 'MythicFish', count: items.MythicFish, emoji: '🐠', label: 'Mythic Fish' });

    if (toSell.length === 0)
      return message.channel.send("You don't have any fish to sell. Use `!fish` to go fishing first!");

    let total = 0;
    const lines = [];
    const update = {};

    for (const item of toSell) {
      const base  = FISH_PRICES[item.key] * item.count;
      const final = applyPrestige(base, prestige);
      total      += final;
      update[`Items.${item.key}`] = 0;
      lines.push(`${item.emoji} ${item.count}× ${item.label} → **₪ ${final.toLocaleString()}**`);
    }

    await profileModel.findOneAndUpdate(
      { userID: message.author.id },
      { $inc: { coins: total }, $set: update }
    );

    await message.channel.send(
      `🏪 **Sold!**\n${lines.join('\n')}\n\n` +
      `💰 Total: **₪ ${total.toLocaleString()}** added to your wallet.` +
      (prestige > 0 ? `\n✨ Prestige ${prestige} bonus included.` : '')
    );

    await awardXP(message, profileModel, 'sell');
  },
};
const profileModel = require('../../models/profileSchema');
const { awardXP, FISH_PRICES, isJailed } = require('../../functions/economy');

module.exports = {
  name: 'fish',
  cooldown: 45,
  aliases: ['f'],
  description: 'Go fishing! Sell your catch with `!sell fish`.',

  async execute(message, args, cmd, client, profileData, settings) {
    if (isJailed(profileData)) {
      const secs = Math.ceil((new Date(profileData.jailUntil) - Date.now()) / 1000);
      return message.channel.send(`🚔 You can't fish from jail. **${secs}s** left on your sentence.`);
    }

    if (!profileData.Items?.FishingRod)
      return message.channel.send(`🎣 You need a fishing rod! Buy one from \`${settings?.prefix || '!'}shop\` for ₪ 10,000.`);

    const fishes = [
      'CommonFish', 'CommonFish', 'CommonFish', 'CommonFish', 'CommonFish', 'CommonFish',
      'RareFish', 'RareFish', 'RareFish',
      'MythicFish',
    ];
    const caught = fishes[Math.floor(Math.random() * fishes.length)];
    const count  = Math.floor(Math.random() * 3) + 1;
    const field  = `Items.${caught}`;

    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { [field]: count } });

    const emoji    = { CommonFish: '🐟', RareFish: '🐡', MythicFish: '🐠' };
    const sellVal  = FISH_PRICES[caught] * count;
    const label    = caught.replace('Fish', ' Fish');

    const msg = await message.channel.send('🎣 Casting...');
    setTimeout(() => {
      msg.edit(
        `🎣 Caught **${count}× ${emoji[caught] || ''} ${label}**!\n` +
        `Worth **₪ ${sellVal.toLocaleString()}** if sold. Use \`!sell fish\` to cash out.`
      );
    }, 1200);

    await awardXP(message, profileModel, 'fish');
  },
};
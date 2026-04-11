const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'fish',
  cooldown: 45,
  aliases: ['f'],
  description: 'Go fishing!',
  async execute(message, args, cmd, client, profileData, settings) {
    if (!profileData.Items?.FishingRod) return message.channel.send(`You don't have a fishing rod! Buy one from \`${settings?.prefix || '!'}shop\``);
    const fishes = ['common fish','common fish','common fish','common fish','common fish','common fish','rare fish','rare fish','rare fish','mythic fish'];
    const caught = fishes[Math.floor(Math.random() * fishes.length)];
    const count = Math.floor(Math.random() * 3) + 1;
    const fieldMap = { 'common fish': 'Items.CommonFish', 'rare fish': 'Items.RareFish', 'mythic fish': 'Items.MythicFish' };
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { [fieldMap[caught]]: count } });
    const msg = await message.channel.send('Fishing...');
    setTimeout(() => msg.edit(`🎣 Caught \`${count}\` ${caught}!`), 1000);
  }
};

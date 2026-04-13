const profileModel = require('../../models/profileSchema');
const { awardXP } = require('../../functions/xp');  // <-- ADD THIS

module.exports = {
  name: 'beg',
  description: 'Beg for coins',
  cooldown: 60,
  async execute(message, args, cmd, client, profileData) {
    const d = Math.random();
    if (d < 0.7) {
      const randomNumber = Math.floor(Math.random() * 500) + 1;
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: randomNumber } });
      const messages = [
        `Charli D'Amelio threw **₪${randomNumber}** at you whilst dancing!`,
        `Ben Simmons shot a 3! Earning you **₪${randomNumber}**!`,
        `Your mom donated **₪${randomNumber}** which landed in your hands.`,
        `Steven Hawking sent down **₪${randomNumber}** from heaven!`,
        `Gurkirat (developer) sent you **₪${randomNumber}**!`,
        `Someone finally liked your tiktok earning you **₪${randomNumber}**!`,
        `A fan blew **₪${randomNumber}** at you.`,
        `Your friend lent you **₪${randomNumber}**. Remember to return it.`,
        `You robbed a bank for **₪${randomNumber}**!`,
        `You found **₪${randomNumber}** on the ground while walking.`,
        `You uploaded a TikTok and pulled **₪${randomNumber}** from the creator fund!`,
        `Stop begging! Well, here's **₪${randomNumber}** since you asked so nicely.`,
        `You earned **₪${randomNumber}** for doing absolutely nothing.`,
      ];
      await message.channel.send(messages[Math.floor(Math.random() * messages.length)]);
    } else {
      const loss = Math.floor(Math.random() * 500) + 1;
      await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { coins: -loss } });
      const fail = [
        `You lost **₪ ${loss}** after crying like a wimp.`,
        `You begged too hard and lost **₪ ${loss}**.`,
        `You paid too much attention in class and lost **₪ ${loss}**.`,
        `The developer took **₪ ${loss}** because of your horrible behaviour today.`,
        `You donated to a streamer and lost **₪ ${loss}**.`,
      ];
      await message.channel.send(fail[Math.floor(Math.random() * fail.length)]);
    }

    await awardXP(message, 'beg');  // <-- ADD THIS
  }
};
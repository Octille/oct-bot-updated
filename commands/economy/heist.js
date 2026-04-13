const profileModel = require('../../models/profileSchema');
const { applyPrestige, awardXP, isJailed, jailTimeLeft } = require('../../functions/economy');

const SUCCESS_STORIES = [
  'You sneak into the Brampton First National Bank through the ventilation system. The vault door cracks open. You stuff your bag and vanish into the night.',
  'A coordinated smash-and-grab at a downtown jeweller. You\'re in and out in 45 seconds flat.',
  'You hack the transfer system at a city exchange. A few zeros shift around. Nobody notices until you\'re long gone.',
  'Your crew storms the armoured truck. Nobody gets hurt. The bags are heavy. You disappear.',
  'A high-society gala. You mingle with the guests, lift a few wallets and a very expensive necklace, then slip out the back.',
];

const FAIL_STORIES = [
  'The silent alarm goes off. You bolt — but a cop car cuts you off two blocks later.',
  'Your getaway driver panics and leaves you. You\'re caught trying to flag down a cab.',
  'A security guard was still in the building. You sprint but you\'re not fast enough.',
  'Your crowbar slips and hits the glass case. The sound echoes everywhere. You freeze.',
  'A bystander spots you and calls it in immediately. Squad cars arrive in under a minute.',
];

module.exports = {
  name: 'heist',
  aliases: ['rob2', 'bigheist'],
  cooldown: 2 * 60 * 60, // 2 hours
  description: 'Pull off a high-risk heist. Requires Level 15.',

  async execute(message, args, cmd, client, profileData) {
    const level   = profileData.level || 1;
    const prestige = profileData.prestige || 0;

    // Level gate
    if (level < 15)
      return message.channel.send(`🔒 You need **Level 15** to attempt a heist. You're Level ${level}. Keep grinding!`);

    // Jail check
    if (isJailed(profileData)) {
      const secs = jailTimeLeft(profileData);
      return message.channel.send(`🚔 You're already in jail for **${secs}s** more. Plan your next heist from your cell.`);
    }

    // 40% success
    const success = Math.random() < 0.40;

    if (success) {
      const loot   = Math.floor(Math.random() * 65_001) + 15_000; // 15k–80k
      const total  = applyPrestige(loot, prestige);
      await profileModel.findOneAndUpdate(
        { userID: message.author.id },
        { $inc: { coins: total } }
      );

      const story = SUCCESS_STORIES[Math.floor(Math.random() * SUCCESS_STORIES.length)];
      await message.channel.send(
        `🎭 **Heist successful!**\n${story}\n\n` +
        `💰 You walked away with **₪ ${total.toLocaleString()}**.` +
        (prestige > 0 ? ` *(Prestige ${prestige} bonus included)*` : '')
      );
    } else {
      // Fail: lose coins + jail time
      const fine      = Math.floor(Math.random() * 15_001) + 5_000; // 5k–20k
      const jailMins  = Math.floor(Math.random() * 6) + 5;          // 5–10 min
      const jailUntil = new Date(Date.now() + jailMins * 60 * 1000);
      const actualFine = Math.min(fine, profileData.coins); // can't lose more than you have

      await profileModel.findOneAndUpdate(
        { userID: message.author.id },
        { $inc: { coins: -actualFine }, $set: { jailUntil } }
      );

      const story = FAIL_STORIES[Math.floor(Math.random() * FAIL_STORIES.length)];
      await message.channel.send(
        `🚔 **Caught!**\n${story}\n\n` +
        `You paid **₪ ${actualFine.toLocaleString()}** in fines and you're locked up for **${jailMins} minutes**.\n` +
        `All economy commands are unavailable until you're released.`
      );
    }

    await awardXP(message, profileModel, 'heist');
  },
};
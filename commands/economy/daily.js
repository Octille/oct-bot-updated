const profileModel = require('../../models/profileSchema');
const { calcDaily, streakMultiplier, awardXP, isJailed } = require('../../functions/economy');

module.exports = {
  name: 'daily',
  cooldown: 60 * 60 * 24,
  description: 'Claim your daily reward. Streak bonuses apply!',

  async execute(message, args, cmd, client, profileData) {
    if (isJailed(profileData)) {
      const secs = Math.ceil((new Date(profileData.jailUntil) - Date.now()) / 1000);
      return message.channel.send(`🚔 You're in jail for **${secs}s** more. Can't claim your daily from a cell.`);
    }

    const now       = new Date();
    const lastDaily = profileData.lastDaily ? new Date(profileData.lastDaily) : null;
    let streak      = profileData.streak || 0;

    if (lastDaily) {
      const hoursSince = (now - lastDaily) / 3_600_000;
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return message.channel.send(`⏳ You already claimed your daily. Come back in **${hoursLeft}h**.`);
      }
      // Missed a day — reset streak
      if (hoursSince > 48) streak = 0;
      else streak += 1;
    } else {
      streak = 1;
    }

    const prestige = profileData.prestige || 0;
    const amount   = calcDaily(streak, prestige);
    const mult     = streakMultiplier(streak);

    await profileModel.findOneAndUpdate(
      { userID: message.author.id },
      {
        $inc: { coins: amount },
        $set: { streak, lastDaily: now },
      }
    );

    // Streak milestone messages
    const milestones = { 3: '🔥 3-day streak!', 7: '🔥🔥 One week streak!', 14: '🔥🔥🔥 Two weeks!', 30: '💥 30-day streak!', 60: '👑 60-day streak!' };
    const milestone = milestones[streak] ? `\n${milestones[streak]}` : '';

    // Hint at streak bonus if they haven't hit a multiplier yet
    const nextMilestone = [3,7,14,30,60].find(m => m > streak);
    const hint = nextMilestone && !milestone
      ? `\n📅 Streak: **${streak}** day(s) — ${nextMilestone - streak} more day(s) until next bonus`
      : `\n📅 Streak: **${streak}** day(s) — **${mult}×** multiplier active`;

    await message.channel.send(
      `☀️ Daily claimed! **₪ ${amount.toLocaleString()}** added to your wallet.${milestone}${hint}`
      + (prestige > 0 ? `\n✨ Prestige ${prestige} bonus included.` : '')
    );

    await awardXP(message, profileModel, 'daily');
  },
};
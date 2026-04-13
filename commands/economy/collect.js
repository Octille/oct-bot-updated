const profileModel = require('../../models/profileSchema');
const { calcPendingWages } = require('../../functions/economy');

module.exports = {
  name: 'collect',
  aliases: ['wages', 'claim'],
  description: 'Collect wages from your company workers.',

  async execute(message, args, cmd, client, profileData) {
    const company    = profileData.Company;
    const workers    = company?.workers || 0;
    const hasManager = company?.hasManager || false;
    const prestige   = profileData.prestige || 0;

    if (workers === 0)
      return message.channel.send("You don't have any workers yet! Hire some with `!company buy worker`.");

    if (hasManager)
      return message.channel.send('🧑‍💼 Your Manager auto-collects your wages — you don\'t need to do this manually! Check `!company` to see your earnings.');

    const pending = calcPendingWages(company, prestige);

    if (pending < 1)
      return message.channel.send("Your workers haven't earned anything yet. Come back in a bit — they earn ₪ 500/hr each.");

    await profileModel.findOneAndUpdate(
      { userID: message.author.id },
      {
        $inc: { coins: pending },
        $set: { 'Company.lastCollected': new Date(), 'Company.pendingWages': 0 },
      }
    );

    const hourly = workers * 500;
    message.channel.send(
      `💼 Wages collected! **₪ ${pending.toLocaleString()}** added to your wallet.\n` +
      `Workers: **${workers}** earning ₪ ${hourly.toLocaleString()}/hr.\n` +
      `💡 Buy a **Manager** (\`!company shop\`) to collect automatically.`
    );
  },
};
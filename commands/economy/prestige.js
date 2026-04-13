const profileModel = require('../../models/profileSchema');

const MAX_PRESTIGE = 5;

const PRESTIGE_FLAVOUR = [
  'You pack up everything you own and start from scratch — but you remember every lesson.',
  'You hand your empire to the next person and walk out with nothing but experience.',
  'The reset is brutal. But you know exactly what to do this time.',
  'You torch it all down. The smoke smells like opportunity.',
  'This is your fifth and final rebirth. Absolute legend status.',
];

module.exports = {
  name: 'prestige',
  description: 'Reset your level for a permanent +5% income bonus. Requires Level 25.',

  async execute(message, args, cmd, client, profileData) {
    const level    = profileData.level    || 1;
    const prestige = profileData.prestige || 0;

    if (level < 25)
      return message.channel.send(`🔒 **Prestige** requires **Level 25**. You're Level ${level}. ${25 - level} level(s) to go.`);

    if (prestige >= MAX_PRESTIGE)
      return message.channel.send(`👑 You're already at **Prestige ${MAX_PRESTIGE}** — the maximum. You're a living legend. Nothing left to prove.`);

    // Confirm step to prevent accidents
    if (args[0] !== 'confirm')
      return message.channel.send(
        `⚠️ **Prestige** will reset your level back to **1** and wipe your mining tool.\n` +
        `In return, you gain a permanent **+5% income bonus** on ALL earnings (stacks with future prestiges).\n` +
        `Your coins, fish, workers and company are kept.\n\n` +
        `Current prestige: **${prestige}** → New: **${prestige + 1}** (+${(prestige + 1) * 5}% total bonus)\n\n` +
        `Type \`!prestige confirm\` if you're sure.`
      );

    const newPrestige = prestige + 1;
    const flavour = PRESTIGE_FLAVOUR[prestige] || PRESTIGE_FLAVOUR[0];

    await profileModel.findOneAndUpdate(
      { userID: message.author.id },
      {
        $set: {
          level:           1,
          xp:              0,
          prestige:        newPrestige,
          'Mine.toolTier': -1,  // reset tool — re-earn it
        },
      }
    );

    message.channel.send(
      `✨ **Prestige ${newPrestige}!**\n${flavour}\n\n` +
      `→ Level reset to **1**\n` +
      `→ Mining tool reset — re-earn it\n` +
      `→ Permanent income bonus: **+${newPrestige * 5}%** on all earnings\n\n` +
      `The grind starts again. You know the way.`
    );
  },
};
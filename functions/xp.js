const profileModel = require('../models/profileSchema');

// How much XP is needed to reach a given level.
// Uses a curve: each level costs 5 * level^2 + 50 * level + 100 XP.
// Level 1→2 = 155 XP, Level 9→10 = 1050 XP, Level 19→20 = 3000 XP.
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

// XP rewards per command type. Tune these freely.
const XP_REWARDS = {
  beg:      { min: 5,  max: 15  },
  daily:    { min: 50, max: 50  },  // fixed bonus
  mine:     { min: 20, max: 40  },
  fish:     { min: 10, max: 25  },
  coinflip: { min: 5,  max: 10  },
  work:     { min: 15, max: 30  },
  crime:    { min: 10, max: 20  },
  rob:      { min: 10, max: 20  },
  default:  { min: 3,  max: 8   },
};

/**
 * Award XP to a user and handle level-ups.
 *
 * @param {object} message  - Discord message object
 * @param {string} source   - Key from XP_REWARDS (e.g. 'beg', 'mine')
 * @returns {object}        - { xpGained, levelled, newLevel }
 */
async function awardXP(message, source = 'default') {
  const reward = XP_REWARDS[source] || XP_REWARDS.default;
  const xpGained = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;

  // Fetch fresh profile (awardXP is called after the command already ran)
  const profile = await profileModel.findOne({ userID: message.author.id });
  if (!profile) return { xpGained: 0, levelled: false, newLevel: 1 };

  let newXP    = (profile.xp    || 0) + xpGained;
  let newLevel = (profile.level || 1);
  let levelled = false;

  // Check for level-up (supports multiple level-ups from a single big gain)
  while (newXP >= xpForLevel(newLevel)) {
    newXP   -= xpForLevel(newLevel);
    newLevel += 1;
    levelled  = true;
  }

  await profileModel.findOneAndUpdate(
    { userID: message.author.id },
    { $set: { xp: newXP, level: newLevel } }
  );

  // Announce level-up in the same channel
  if (levelled) {
    const perks = getLevelPerks(newLevel);
    let desc = `🎉 **${message.author.username}** levelled up to **Level ${newLevel}**!`;
    if (perks) desc += `\n${perks}`;
    message.channel.send(desc).catch(() => {});
  }

  return { xpGained, levelled, newLevel };
}

/**
 * Return a perk description string for notable levels, or null otherwise.
 * Customise these however you like.
 */
function getLevelPerks(level) {
  const perks = {
    5:  '✅ Unlocked: **Crime** command',
    10: '✅ Unlocked: **Silver Pickaxe** in the shop (+50% mine output)',
    15: '✅ Unlocked: **Heist** command',
    20: '✅ Unlocked: **Gold Pickaxe** in the shop (+150% mine output)',
    25: '✅ Unlocked: **Prestige** — reset your level for a permanent 10% coin bonus',
    50: '✅ Unlocked: **Diamond Pickaxe** — absolute endgame mining power',
  };
  return perks[level] || null;
}

/**
 * Build a visual XP progress bar string.
 * e.g.  [████████░░░░░░░░░░░░]  800 / 1050 XP
 */
function xpBar(xp, level, barLength = 20) {
  const needed   = xpForLevel(level);
  const filled   = Math.round((xp / needed) * barLength);
  const empty    = barLength - filled;
  const bar      = '█'.repeat(filled) + '░'.repeat(empty);
  return `\`[${bar}]\`  ${xp.toLocaleString()} / ${needed.toLocaleString()} XP`;
}

module.exports = { awardXP, xpForLevel, xpBar };
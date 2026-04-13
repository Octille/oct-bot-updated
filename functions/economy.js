// functions/economy.js
// Shared helpers imported by all economy commands.
// Single source of truth for balance numbers — edit here, everything updates.

// ── Prestige multiplier ───────────────────────────────────────────────────────
// Each prestige level adds 5% to ALL coin income across the board.
function prestigeMult(prestige = 0) {
  return 1 + Math.min(prestige, 5) * 0.05;
}

// ── Apply prestige to a coin amount ──────────────────────────────────────────
function applyPrestige(amount, prestige = 0) {
  return Math.round(amount * prestigeMult(prestige));
}

// ── XP system ────────────────────────────────────────────────────────────────
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

const XP_REWARDS = {
  beg:    { min: 5,  max: 15  },
  daily:  { min: 50, max: 50  },
  mine:   { min: 20, max: 40  },
  fish:   { min: 10, max: 25  },
  sell:   { min: 5,  max: 10  },
  heist:  { min: 30, max: 60  },
  rob:    { min: 10, max: 20  },
  work:   { min: 15, max: 30  },
  default:{ min: 3,  max: 8   },
};

async function awardXP(message, profileModel, source = 'default') {
  const reward   = XP_REWARDS[source] || XP_REWARDS.default;
  const xpGained = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;

  const profile  = await profileModel.findOne({ userID: message.author.id });
  if (!profile) return { xpGained: 0, levelled: false, newLevel: 1 };

  let newXP    = (profile.xp    || 0) + xpGained;
  let newLevel = (profile.level || 1);
  let levelled = false;

  while (newXP >= xpForLevel(newLevel)) {
    newXP   -= xpForLevel(newLevel);
    newLevel += 1;
    levelled  = true;
  }

  await profileModel.findOneAndUpdate(
    { userID: message.author.id },
    { $set: { xp: newXP, level: newLevel } }
  );

  if (levelled) {
    const perk = getLevelPerk(newLevel);
    let msg = `🎉 **${message.author.username}** levelled up to **Level ${newLevel}**!`;
    if (perk) msg += `\n${perk}`;
    message.channel.send(msg).catch(() => {});
  }

  return { xpGained, levelled, newLevel };
}

function getLevelPerk(level) {
  const perks = {
    5:  '✅ Unlocked: **Gold Pickaxe** in `!mineupgrade`',
    10: '✅ Unlocked: **Diamond Pickaxe** in `!mineupgrade`',
    15: '✅ Unlocked: **Drill** in `!mineupgrade` + **`!heist`** command',
    20: '✅ Unlocked: **Excavator** in `!mineupgrade`',
    25: '✅ Unlocked: **`!prestige`** — reset for a permanent income bonus',
  };
  return perks[level] || null;
}

function xpBar(xp, level, barLength = 20) {
  const needed = xpForLevel(level);
  const filled = Math.round((xp / needed) * barLength);
  const bar    = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, barLength - filled));
  return `\`[${bar}]\`  ${xp.toLocaleString()} / ${needed.toLocaleString()} XP`;
}

// ── Mine config ───────────────────────────────────────────────────────────────
const TOOLS = [
  { tier: 0, name: 'Wooden Pickaxe',  emoji: '🪵', cost:     2_000, mult:  1.5, level:  1 },
  { tier: 1, name: 'Stone Pickaxe',   emoji: '🪨', cost:     8_000, mult:  2.5, level:  1 },
  { tier: 2, name: 'Iron Pickaxe',    emoji: '⛏️',  cost:    25_000, mult:  4.0, level:  1 },
  { tier: 3, name: 'Gold Pickaxe',    emoji: '🌟', cost:    75_000, mult:  7.0, level:  5 },
  { tier: 4, name: 'Diamond Pickaxe', emoji: '💎', cost:   200_000, mult: 12.0, level: 10 },
  { tier: 5, name: 'Drill',           emoji: '🔩', cost:   500_000, mult: 20.0, level: 15 },
  { tier: 6, name: 'Excavator',       emoji: '🚜', cost: 1_500_000, mult: 35.0, level: 20 },
];

const ORES = [
  { name: 'Coal',     emoji: '🪨', weight: 0.60, mult: 1.0,  color: '#5c5c5c' },
  { name: 'Iron',     emoji: '🔩', weight: 0.20, mult: 1.5,  color: '#b5b5b5' },
  { name: 'Gold',     emoji: '🟡', weight: 0.12, mult: 2.5,  color: '#ffd700' },
  { name: 'Diamond',  emoji: '💎', weight: 0.06, mult: 5.0,  color: '#00cfff' },
  { name: 'Amethyst', emoji: '🔮', weight: 0.02, mult: 10.0, color: '#9b59b6' },
];

const BASE_MINE_OUTPUT = { min: 150, max: 350 };

function rollOre() {
  const r = Math.random();
  let cum = 0;
  for (const ore of ORES) { cum += ore.weight; if (r < cum) return ore; }
  return ORES[0];
}

function calcMineOutput(toolTier, prestige = 0) {
  const base     = Math.floor(Math.random() * (BASE_MINE_OUTPUT.max - BASE_MINE_OUTPUT.min + 1)) + BASE_MINE_OUTPUT.min;
  const tool     = toolTier >= 0 ? TOOLS[toolTier] : null;
  const toolMult = tool ? tool.mult : 1.0;
  const ore      = rollOre();
  const raw      = Math.round(base * toolMult * ore.mult);
  const total    = applyPrestige(raw, prestige);
  return { base, toolMult, ore, raw, total };
}

// ── Fish sell prices ──────────────────────────────────────────────────────────
const FISH_PRICES = {
  CommonFish: 200,
  RareFish:   800,
  MythicFish: 3000,
};

// ── Company config ────────────────────────────────────────────────────────────
const WORKER_HOURLY   = 500;      // coins per worker per hour
const MANAGER_COST    = 250_000;  // one-time purchase, auto-collects wages
const MAX_WORKERS     = 20;

function workerCost(owned) {
  if (owned < 3)  return  50_000;
  if (owned < 7)  return 100_000;
  if (owned < 12) return 200_000;
  return 400_000;
}

// Accrue pending wages since last collection
function calcPendingWages(company, prestige = 0) {
  if (!company?.workers || !company?.lastCollected) return 0;
  const hours   = Math.min((Date.now() - new Date(company.lastCollected)) / 3_600_000, 168); // cap at 1 week
  const raw     = Math.floor(company.workers * WORKER_HOURLY * hours);
  return applyPrestige(raw, prestige);
}

// ── Daily streak config ───────────────────────────────────────────────────────
const DAILY_BASE = 7_500;

function streakMultiplier(streak) {
  if (streak >= 60) return 2.5;
  if (streak >= 30) return 2.0;
  if (streak >= 14) return 1.75;
  if (streak >= 7)  return 1.5;
  if (streak >= 3)  return 1.25;
  return 1.0;
}

function calcDaily(streak, prestige = 0) {
  const mult = streakMultiplier(streak);
  return applyPrestige(Math.round(DAILY_BASE * mult), prestige);
}

// ── Jail helper ───────────────────────────────────────────────────────────────
function isJailed(profileData) {
  return profileData.jailUntil && new Date(profileData.jailUntil) > new Date();
}

function jailTimeLeft(profileData) {
  if (!isJailed(profileData)) return 0;
  return Math.ceil((new Date(profileData.jailUntil) - Date.now()) / 1000);
}

module.exports = {
  prestigeMult, applyPrestige,
  xpForLevel, awardXP, xpBar,
  TOOLS, ORES, rollOre, calcMineOutput,
  FISH_PRICES,
  WORKER_HOURLY, MANAGER_COST, MAX_WORKERS, workerCost, calcPendingWages,
  DAILY_BASE, streakMultiplier, calcDaily,
  isJailed, jailTimeLeft,
};
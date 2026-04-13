
const BASE_OUTPUT = { min: 150, max: 350 };

// Tool tiers. Index = tier number stored in profile.Mine.toolTier
// mult: multiplies base output
// level: minimum player level required to buy
const TOOLS = [
  { tier: 0, name: 'Wooden Pickaxe',  emoji: '🪵', cost:     2_000, mult:  1.5, level:  1 },
  { tier: 1, name: 'Stone Pickaxe',   emoji: '🪨', cost:     8_000, mult:  2.5, level:  1 },
  { tier: 2, name: 'Iron Pickaxe',    emoji: '⛏️',  cost:    25_000, mult:  4.0, level:  1 },
  { tier: 3, name: 'Gold Pickaxe',    emoji: '🌟', cost:    75_000, mult:  7.0, level:  5 },
  { tier: 4, name: 'Diamond Pickaxe', emoji: '💎', cost:   200_000, mult: 12.0, level: 10 },
  { tier: 5, name: 'Drill',           emoji: '🔩', cost:   500_000, mult: 20.0, level: 15 },
  { tier: 6, name: 'Excavator',       emoji: '🚜', cost: 1_500_000, mult: 35.0, level: 20 },
];

// Ore rarity table — rolled once per mine, modifies the haul on top of tool mult
// Probabilities must sum to 1.0
const ORES = [
  { name: 'Coal',     emoji: '🪨', weight: 0.60, mult: 1.0,  color: '#5c5c5c' },
  { name: 'Iron',     emoji: '🔩', weight: 0.20, mult: 1.5,  color: '#b5b5b5' },
  { name: 'Gold',     emoji: '🟡', weight: 0.12, mult: 2.5,  color: '#ffd700' },
  { name: 'Diamond',  emoji: '💎', weight: 0.06, mult: 5.0,  color: '#00cfff' },
  { name: 'Amethyst', emoji: '🔮', weight: 0.02, mult: 10.0, color: '#9b59b6' },
];

// Mine cooldown in seconds
const MINE_COOLDOWN = 30 * 60; // 30 minutes

// ── helpers ──────────────────────────────────────────────────────────────────

/** Roll which ore was found using weighted random */
function rollOre() {
  const r = Math.random();
  let cumulative = 0;
  for (const ore of ORES) {
    cumulative += ore.weight;
    if (r < cumulative) return ore;
  }
  return ORES[0]; // fallback
}

/** Calculate the coins earned for one mine action */
function calcMineOutput(toolTier) {
  const base = Math.floor(Math.random() * (BASE_OUTPUT.max - BASE_OUTPUT.min + 1)) + BASE_OUTPUT.min;
  const tool = toolTier >= 0 ? TOOLS[toolTier] : null;
  const toolMult = tool ? tool.mult : 1.0;
  const ore = rollOre();
  const total = Math.round(base * toolMult * ore.mult);
  return { base, toolMult, ore, total };
}

/** Get tool object by tier, or null */
function getTool(tier) {
  return TOOLS[tier] ?? null;
}

/** Return the next tool tier a player can buy (the tier above what they own) */
function nextTier(currentTier) {
  return currentTier + 1;
}

module.exports = { BASE_OUTPUT, TOOLS, ORES, MINE_COOLDOWN, rollOre, calcMineOutput, getTool, nextTier };
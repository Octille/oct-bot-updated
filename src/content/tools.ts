/** Pickaxes and rods. A tool with 0 durability is broken and works like having none until repaired. */
export interface Tool {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  level: number;
  durability: number;
  /** Pickaxes: haul multiplier. */
  mult?: number;
  /** Rods: shifts catches toward rarer fish (0 = none). */
  luck?: number;
  /** Rods: extra milliseconds you get to hit REEL. */
  windowBonusMs?: number;
  /** Rods, weapons, shovels: multiplies what each find is worth. */
  valueMult?: number;
  /** Shovels: how many squares you can dig per /dig. */
  digs?: number;
}

export const pickaxes: readonly Tool[] = [
  { id: 'pick_wood', name: 'Wooden Pickaxe', emoji: '🪵', cost: 2_000, level: 0, durability: 40, mult: 1.4 },
  { id: 'pick_stone', name: 'Stone Pickaxe', emoji: '🪨', cost: 8_000, level: 0, durability: 50, mult: 2 },
  { id: 'pick_iron', name: 'Iron Pickaxe', emoji: '⛏️', cost: 25_000, level: 3, durability: 60, mult: 3 },
  { id: 'pick_gold', name: 'Gold Pickaxe', emoji: '🌟', cost: 75_000, level: 5, durability: 100, mult: 4.5 },
  { id: 'pick_diamond', name: 'Diamond Pickaxe', emoji: '💎', cost: 200_000, level: 10, durability: 160, mult: 5.5 },
  { id: 'pick_drill', name: 'Drill', emoji: '🔩', cost: 500_000, level: 15, durability: 300, mult: 8 },
  { id: 'pick_excavator', name: 'Excavator', emoji: '🚜', cost: 1_500_000, level: 20, durability: 500, mult: 16 },
];

export const rods: readonly Tool[] = [
  { id: 'rod_old', name: 'Old Rod', emoji: '🎣', cost: 0, level: 0, durability: 40, luck: 0, windowBonusMs: 0, valueMult: 1 },
  { id: 'rod_fiberglass', name: 'Fiberglass Rod', emoji: '🎣', cost: 5_000, level: 0, durability: 50, luck: 1, windowBonusMs: 150, valueMult: 1.2 },
  { id: 'rod_carbon', name: 'Carbon Rod', emoji: '🎣', cost: 30_000, level: 5, durability: 70, luck: 2, windowBonusMs: 300, valueMult: 1.4 },
  { id: 'rod_pro', name: 'Pro Rod', emoji: '🎣', cost: 120_000, level: 12, durability: 180, luck: 3, windowBonusMs: 450, valueMult: 2.6 },
  { id: 'rod_legend', name: 'Legendary Rod', emoji: '🔱', cost: 600_000, level: 22, durability: 330, luck: 4, windowBonusMs: 600, valueMult: 4.5 },
];

/** Hunting weapons: luck finds rarer animals, the bonus is extra reaction time, value scales trophies. */
export const weapons: readonly Tool[] = [
  { id: 'weapon_slingshot', name: 'Slingshot', emoji: '🪃', cost: 1_500, level: 0, durability: 25, luck: 0, windowBonusMs: 0, valueMult: 1 },
  { id: 'weapon_bow', name: 'Hunting Bow', emoji: '🏹', cost: 7_500, level: 2, durability: 32, luck: 1, windowBonusMs: 150, valueMult: 1.3 },
  { id: 'weapon_crossbow', name: 'Crossbow', emoji: '🎯', cost: 35_000, level: 6, durability: 80, luck: 2, windowBonusMs: 250, valueMult: 1.8 },
  { id: 'weapon_rifle', name: 'Rifle', emoji: '🔫', cost: 140_000, level: 12, durability: 180, luck: 3, windowBonusMs: 350, valueMult: 2.8 },
  { id: 'weapon_harpoon', name: "Oct's Harpoon", emoji: '🔱', cost: 650_000, level: 22, durability: 420, luck: 4, windowBonusMs: 450, valueMult: 4.5 },
];

/** Shovels: more digs per /dig, luckier treasure, and more coins per square. */
export const shovels: readonly Tool[] = [
  { id: 'shovel_trowel', name: 'Trowel', emoji: '🥄', cost: 1_000, level: 0, durability: 25, digs: 2, luck: 0, valueMult: 1 },
  { id: 'shovel_spade', name: 'Spade', emoji: '🪏', cost: 6_000, level: 2, durability: 32, digs: 3, luck: 1, valueMult: 1.3 },
  { id: 'shovel_steel', name: 'Steel Shovel', emoji: '⛏️', cost: 30_000, level: 6, durability: 80, digs: 3, luck: 2, valueMult: 1.9 },
  { id: 'shovel_auger', name: 'Power Auger', emoji: '🌀', cost: 130_000, level: 13, durability: 180, digs: 4, luck: 3, valueMult: 2.5 },
  { id: 'shovel_treasure', name: 'Treasure Drill', emoji: '💎', cost: 600_000, level: 23, durability: 420, digs: 4, luck: 4, valueMult: 3.8 },
];

export type ToolSlot = 'pickaxe' | 'rod' | 'weapon' | 'shovel';
export const toolSets: Record<ToolSlot, readonly Tool[]> = { pickaxe: pickaxes, rod: rods, weapon: weapons, shovel: shovels };

/** A full repair costs this fraction of the tool's price (partial repairs are pro rata). */
export const repairCostFraction = 0.22;

/** Every player can fish from day one with this rod. */
export const starterRod = 'rod_old';

export function findTool(slot: ToolSlot, id: string | null | undefined): Tool | null {
  return toolSets[slot].find((t) => t.id === id) ?? null;
}

export function nextTool(slot: ToolSlot, id: string | null | undefined): Tool | null {
  const set = toolSets[slot];
  const index = set.findIndex((t) => t.id === id);
  return set[index + 1] ?? null;
}

export function repairCost(tool: Tool, durability: number): number {
  const missing = Math.max(0, tool.durability - durability);
  // The starter rod is free, so give it a token repair cost
  const price = tool.cost || 1_000;
  return Math.ceil((price * repairCostFraction * missing) / tool.durability);
}

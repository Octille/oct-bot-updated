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
  /** Rods: multiplies what each catch is worth. */
  valueMult?: number;
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

export type ToolSlot = 'pickaxe' | 'rod';
export const toolSets: Record<ToolSlot, readonly Tool[]> = { pickaxe: pickaxes, rod: rods };

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

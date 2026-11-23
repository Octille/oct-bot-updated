/** /mine — pick one of three tunnels. Each tunnel type trades safety for haul and gem chance. */

export const mineBase = { min: 80, max: 160 } as const;

export interface Ore {
  id: string;
  name: string;
  emoji: string;
  weight: number;
  mult: number;
  color: number;
}

export const ores: readonly Ore[] = [
  { id: 'coal', name: 'Coal', emoji: '🪨', weight: 60, mult: 1, color: 0x5c5c5c },
  { id: 'iron', name: 'Iron', emoji: '🔩', weight: 20, mult: 1.5, color: 0xb5b5b5 },
  { id: 'gold', name: 'Gold', emoji: '🟡', weight: 12, mult: 2.5, color: 0xffd700 },
  { id: 'diamond', name: 'Diamond', emoji: '💎', weight: 6, mult: 5, color: 0x00cfff },
  { id: 'amethyst', name: 'Amethyst', emoji: '🔮', weight: 2, mult: 10, color: 0x9b59b6 },
];

export interface Tunnel {
  id: string;
  name: string;
  emoji: string;
  hint: string;
  /** Chance the tunnel collapses. */
  caveIn: number;
  /** Haul multiplier when it doesn't. */
  haul: number;
  /** Chance of a gem on top of the ore. */
  gem: number;
}

export const tunnels: readonly Tunnel[] = [
  { id: 'safe', name: 'Old Shaft', emoji: '🪨', hint: 'Solid walls. Picked over, but safe.', caveIn: 0.02, haul: 0.9, gem: 0.01 },
  { id: 'damp', name: 'Flooded Passage', emoji: '💧', hint: 'Wet and slow. Decent iron down here.', caveIn: 0.05, haul: 1, gem: 0.02 },
  { id: 'glow', name: 'Glowing Crack', emoji: '✨', hint: 'Something sparkles in the dark.', caveIn: 0.1, haul: 1.1, gem: 0.1 },
  { id: 'rich', name: 'Rich Vein', emoji: '🟨', hint: 'Fresh rock, creaky supports.', caveIn: 0.12, haul: 1.35, gem: 0.03 },
  { id: 'deep', name: 'Deep Pit', emoji: '🕳️', hint: 'Nobody who went down came back poor... or at all.', caveIn: 0.2, haul: 1.7, gem: 0.06 },
];

/** A cave-in keeps this fraction of the haul and costs extra durability. */
export const caveIn = { haulKept: 0.25, extraDurability: 4 } as const;

/** Gems found while mining (item ids in items.ts), weighted. */
export const gems = [
  { itemId: 'gem_quartz', weight: 50 },
  { itemId: 'gem_emerald', weight: 25 },
  { itemId: 'gem_sapphire', weight: 15 },
  { itemId: 'gem_ruby', weight: 8 },
  { itemId: 'gem_octite', weight: 2 },
] as const;

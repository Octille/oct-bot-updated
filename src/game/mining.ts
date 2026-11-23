import { caveIn as caveInConfig, gems, mineBase, ores, tunnels, type Ore, type Tunnel } from '../content/mining';
import { chance, defaultRng, randInt, shuffle, weighted, type Rng } from '../lib/rng';

/** Three different tunnels to choose from. */
export function rollTunnels(rng: Rng = defaultRng): Tunnel[] {
  return shuffle(tunnels, rng).slice(0, 3);
}

export interface MineResult {
  ore: Ore;
  coins: number;
  caveIn: boolean;
  gemId: string | null;
  durabilityUsed: number;
}

export function resolveMine(tunnel: Tunnel, toolMult: number, incomeMult: number, rng: Rng = defaultRng): MineResult {
  const ore = weighted(ores, (o) => o.weight, rng);
  const base = randInt(mineBase.min, mineBase.max, rng);
  const collapsed = chance(tunnel.caveIn, rng);
  const haul = base * toolMult * ore.mult * tunnel.haul * incomeMult;
  const coins = Math.max(1, Math.round(collapsed ? haul * caveInConfig.haulKept : haul));
  const gemId = !collapsed && chance(tunnel.gem, rng) ? weighted(gems, (g) => g.weight, rng).itemId : null;
  return { ore, coins, caveIn: collapsed, gemId, durabilityUsed: 1 + (collapsed ? caveInConfig.extraDurability : 0) };
}

/** Average coins per /mine for a tool, assuming the player picks tunnels at random. For BALANCE.md. */
export function expectedMineCoins(toolMult: number): number {
  const baseAvg = (mineBase.min + mineBase.max) / 2;
  const totalWeight = ores.reduce((s, o) => s + o.weight, 0);
  const oreAvg = ores.reduce((s, o) => s + (o.weight / totalWeight) * o.mult, 0);
  const tunnelAvg = tunnels.reduce((s, t) => s + (t.caveIn * caveInConfig.haulKept + (1 - t.caveIn)) * t.haul, 0) / tunnels.length;
  return baseAvg * toolMult * oreAvg * tunnelAvg;
}

export function expectedGemChance(): number {
  return tunnels.reduce((s, t) => s + (1 - t.caveIn) * t.gem, 0) / tunnels.length;
}

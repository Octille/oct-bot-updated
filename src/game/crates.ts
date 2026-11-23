import type { Crate, LootEntry } from '../content/crates';
import { scratchPrizes } from '../content/consumables';
import { getItem } from '../content/items';
import { defaultRng, randInt, weighted, type Rng } from '../lib/rng';

export interface CrateLoot {
  coins: number;
  items: Record<string, number>;
}

export function openCrate(crate: Crate, rng: Rng = defaultRng): CrateLoot {
  const loot: CrateLoot = { coins: 0, items: {} };
  for (let i = 0; i < crate.rolls; i++) {
    const entry = weighted(crate.loot, (e) => e.weight, rng);
    if ('coins' in entry) loot.coins += randInt(entry.coins[0], entry.coins[1], rng);
    else loot.items[entry.item] = (loot.items[entry.item] ?? 0) + randInt(entry.qty[0], entry.qty[1], rng);
  }
  return loot;
}

function entryValue(e: LootEntry): number {
  if ('coins' in e) return (e.coins[0] + e.coins[1]) / 2;
  return ((e.qty[0] + e.qty[1]) / 2) * (getItem(e.item)?.sellPrice ?? 0);
}

/** Average value of a crate, counting items at their sell price. */
export function expectedCrateValue(crate: Crate): number {
  const total = crate.loot.reduce((s, e) => s + e.weight, 0);
  return crate.rolls * crate.loot.reduce((s, e) => s + (e.weight / total) * entryValue(e), 0);
}

export function scratch(rng: Rng = defaultRng): number {
  return weighted(scratchPrizes, (p) => p.weight, rng).coins;
}

export function expectedScratchValue(): number {
  const total = scratchPrizes.reduce((s, p) => s + p.weight, 0);
  return scratchPrizes.reduce((s, p) => s + (p.weight / total) * p.coins, 0);
}

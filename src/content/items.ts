import type { Rarity } from './rarity';
import { fishSpecies, fishValue } from './fishing';
import { animals, animalValue } from './hunting';
import { treasures, treasureValue } from './digging';
import { basics, buybackRate } from './shop';

export type ItemType = 'tool' | 'consumable' | 'collectible' | 'cosmetic' | 'crate' | 'material' | 'fish';

export interface Item {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  type: ItemType;
  /** What the shop pays for one. */
  sellPrice: number;
  tradable: boolean;
  description: string;
}

const fishItems: Item[] = fishSpecies.map((f) => ({
  id: f.id,
  name: f.name,
  emoji: f.emoji,
  rarity: f.rarity,
  type: 'fish',
  sellPrice: fishValue[f.rarity],
  tradable: true,
  description: `A ${f.name.toLowerCase()} (${f.kg[0]}–${f.kg[1]} kg). Sell it or keep it for your fishdex.`,
}));

const baseItems: Item[] = [
  // Gems from /mine
  { id: 'gem_quartz', name: 'Quartz', emoji: '🤍', rarity: 'uncommon', type: 'material', sellPrice: 300, tradable: true, description: 'Pretty, common, mostly decorative.' },
  { id: 'gem_emerald', name: 'Emerald', emoji: '💚', rarity: 'rare', type: 'material', sellPrice: 900, tradable: true, description: 'A deep green gem from the glowing tunnels.' },
  { id: 'gem_sapphire', name: 'Sapphire', emoji: '💙', rarity: 'rare', type: 'material', sellPrice: 1_500, tradable: true, description: 'Cold, blue and valuable.' },
  { id: 'gem_ruby', name: 'Ruby', emoji: '❤️', rarity: 'epic', type: 'material', sellPrice: 3_500, tradable: true, description: 'It almost looks warm.' },
  { id: 'gem_octite', name: 'Octite', emoji: '🔷', rarity: 'legendary', type: 'material', sellPrice: 15_000, tradable: true, description: 'An eight-sided crystal found nowhere else.' },

  // Search finds
  { id: 'lost_sock', name: 'Lost Sock', emoji: '🧦', rarity: 'common', type: 'collectible', sellPrice: 50, tradable: true, description: 'Its partner is out there somewhere.' },
  { id: 'rubber_duck', name: 'Rubber Duck', emoji: '🦆', rarity: 'uncommon', type: 'collectible', sellPrice: 150, tradable: true, description: 'Squeaks with quiet confidence.' },
  { id: 'old_coin', name: 'Old Coin', emoji: '🪙', rarity: 'rare', type: 'collectible', sellPrice: 600, tradable: true, description: 'Older than the bot. Probably.' },
  { id: 'golden_ticket', name: 'Golden Ticket', emoji: '🎫', rarity: 'epic', type: 'collectible', sellPrice: 2_500, tradable: true, description: 'Admit one. To what, nobody knows.' },

  // Carried over from the original bot by the v2 migration; nothing drops them any more
  { id: 'v2_shirt', name: 'Original Shirt', emoji: '👕', rarity: 'uncommon', type: 'collectible', sellPrice: 100, tradable: true, description: 'From the original OctBot. Nobody sells these any more.' },
  { id: 'v2_pants', name: 'Original Pants', emoji: '👖', rarity: 'uncommon', type: 'collectible', sellPrice: 100, tradable: true, description: 'From the original OctBot. Nobody sells these any more.' },
  { id: 'v2_cookie', name: 'Original Cookie', emoji: '🍪', rarity: 'common', type: 'collectible', sellPrice: 25, tradable: true, description: 'Bought in the original OctBot shop. Somehow still fresh.' },
];

const huntItems: Item[] = animals.map((a) => ({
  id: a.id, name: a.name, emoji: a.emoji, rarity: a.rarity, type: 'material', sellPrice: animalValue[a.rarity], tradable: true,
  description: `A ${a.name.toLowerCase()} trophy from /hunt.`,
}));

const digItems: Item[] = [
  ...treasures.map((t): Item => ({
    id: t.id, name: t.name, emoji: t.emoji, rarity: t.rarity, type: 'collectible', sellPrice: treasureValue[t.rarity], tradable: true,
    description: `Dug up with /dig.`,
  })),
  { id: 'dig_worm', name: 'Earthworm', emoji: '🪱', rarity: 'common', type: 'material', sellPrice: 15, tradable: true, description: 'Wriggly. Worth almost nothing.' },
  { id: 'dig_cap', name: 'Bottle Cap', emoji: '🧢', rarity: 'common', type: 'material', sellPrice: 25, tradable: true, description: 'Currency in some wastelands. Not this one.' },
];

const crimeItems: Item[] = [
  { id: 'crime_watch', name: 'Stolen Watch', emoji: '⌚', rarity: 'rare', type: 'collectible', sellPrice: 600, tradable: true, description: 'Engraved "to Dave". You are not Dave. Only found through /crime.' },
  { id: 'crime_ring', name: 'Diamond Ring', emoji: '💍', rarity: 'epic', type: 'collectible', sellPrice: 2_500, tradable: true, description: 'Someone is having a very bad day. Only found through /crime.' },
  { id: 'crime_bond', name: 'Bearer Bond', emoji: '📜', rarity: 'legendary', type: 'collectible', sellPrice: 9_000, tradable: true, description: 'Whoever holds it, owns it. Only found through /crime.' },
  { id: 'crime_painting', name: 'The Mona Octa', emoji: '🖼️', rarity: 'mythic', type: 'collectible', sellPrice: 40_000, tradable: true, description: 'A priceless eight-armed masterpiece. Only found through /crime.' },
];

const shopPrice = (id: string) => basics.find((b) => b.id === id)?.price;
const buyback = (id: string, fallback: number) => Math.round((shopPrice(id) ?? fallback) * buybackRate);

const consumableItems: Item[] = [
  { id: 'xp_boost', name: 'XP Boost', emoji: '⚡', rarity: 'rare', type: 'consumable', sellPrice: buyback('xp_boost', 8_000), tradable: true, description: '2× account XP for 30 minutes.' },
  { id: 'coin_boost', name: 'Coin Boost', emoji: '💰', rarity: 'rare', type: 'consumable', sellPrice: buyback('coin_boost', 20_000), tradable: true, description: '+50% coins from every earning command for 30 minutes.' },
  { id: 'luck_potion', name: 'Luck Potion', emoji: '🍀', rarity: 'rare', type: 'consumable', sellPrice: buyback('luck_potion', 12_000), tradable: true, description: 'Rarer fish, animals and treasure, and double gem chance, for 30 minutes.' },
  { id: 'bank_note', name: 'Bank Note', emoji: '🏦', rarity: 'uncommon', type: 'consumable', sellPrice: buyback('bank_note', 18_000), tradable: true, description: 'Permanently raises your bank capacity by ₪ 10,000.' },
  { id: 'streak_freeze', name: 'Streak Freeze', emoji: '🧊', rarity: 'rare', type: 'consumable', sellPrice: buyback('streak_freeze', 15_000), tradable: true, description: 'Used automatically to save your daily streak when you miss a day.' },
  { id: 'padlock', name: 'Padlock', emoji: '🔒', rarity: 'uncommon', type: 'consumable', sellPrice: buyback('padlock', 4_000), tradable: true, description: 'Blocks one robbery automatically, then breaks.' },
  { id: 'guard_dog', name: 'Guard Dog', emoji: '🐕', rarity: 'rare', type: 'consumable', sellPrice: buyback('guard_dog', 25_000), tradable: true, description: 'Use it for 3 days of protection: robbers have a much lower chance against you.' },
  { id: 'scratch_card', name: 'Scratch Card', emoji: '🎟️', rarity: 'common', type: 'consumable', sellPrice: buyback('scratch_card', 1_000), tradable: true, description: 'Scratch for a prize of up to ₪ 40,000.' },
];

const crateItems: Item[] = [
  { id: 'crate_common', name: 'Common Crate', emoji: '📦', rarity: 'common', type: 'crate', sellPrice: buyback('crate_common', 5_000), tradable: true, description: 'Two rolls of coins and goodies.' },
  { id: 'crate_rare', name: 'Rare Crate', emoji: '🎁', rarity: 'rare', type: 'crate', sellPrice: 9_000, tradable: true, description: 'Three rolls, with a chance at an Epic Crate.' },
  { id: 'crate_epic', name: 'Epic Crate', emoji: '💜', rarity: 'epic', type: 'crate', sellPrice: 36_000, tradable: true, description: 'Four rolls, with a chance at a Legendary Crate.' },
  { id: 'crate_legendary', name: 'Legendary Crate', emoji: '🌟', rarity: 'legendary', type: 'crate', sellPrice: 160_000, tradable: true, description: 'Five big rolls.' },
];

export const items: readonly Item[] = [...baseItems, ...fishItems, ...huntItems, ...digItems, ...crimeItems, ...consumableItems, ...crateItems];
const byId = new Map(items.map((i) => [i.id, i]));

export function getItem(id: string): Item | undefined {
  return byId.get(id);
}

/** Plain item name for lists and buttons (no emoji). */
export function itemName(id: string, qty?: number): string {
  const name = byId.get(id)?.name ?? id;
  return qty === undefined ? name : `${name} ×${qty.toLocaleString('en-US')}`;
}

/** Item name with its emoji — for flavour moments (a catch, a drop, crate loot). */
export function itemLabel(id: string, qty?: number): string {
  const item = byId.get(id);
  const name = item ? `${item.emoji} ${item.name}` : `\`${id}\``;
  return qty === undefined ? name : `${qty.toLocaleString('en-US')}× ${name}`;
}

/** Search finds are weighted toward the commoner ones. */
export const searchItemWeights: Record<string, number> = {
  lost_sock: 50, rubber_duck: 30, old_coin: 15, golden_ticket: 5,
};

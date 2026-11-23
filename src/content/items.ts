import type { Rarity } from './rarity';
import { fishSpecies, fishValue } from './fishing';

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
];

export const items: readonly Item[] = [...baseItems, ...fishItems];
const byId = new Map(items.map((i) => [i.id, i]));

export function getItem(id: string): Item | undefined {
  return byId.get(id);
}

export function itemLabel(id: string, qty?: number): string {
  const item = byId.get(id);
  const name = item ? `${item.emoji} ${item.name}` : `\`${id}\``;
  return qty === undefined ? name : `${qty.toLocaleString('en-US')}× ${name}`;
}

/** Search finds are weighted toward the commoner ones. */
export const searchItemWeights: Record<string, number> = {
  lost_sock: 50, rubber_duck: 30, old_coin: 15, golden_ticket: 5,
};

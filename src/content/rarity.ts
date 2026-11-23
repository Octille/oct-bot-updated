export const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof rarities)[number];

export const rarityInfo: Record<Rarity, { label: string; emoji: string; color: number }> = {
  common: { label: 'Common', emoji: '⚪', color: 0x95a5a6 },
  uncommon: { label: 'Uncommon', emoji: '🟢', color: 0x2ecc71 },
  rare: { label: 'Rare', emoji: '🔵', color: 0x3498db },
  epic: { label: 'Epic', emoji: '🟣', color: 0x9b59b6 },
  legendary: { label: 'Legendary', emoji: '🟠', color: 0xf39c12 },
  mythic: { label: 'Mythic', emoji: '🔴', color: 0xe74c3c },
};

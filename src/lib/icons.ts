import type { Client } from 'discord.js';
import { EMOJI_PREFIX, iconDefs, type IconKey } from '../content/icons';
import { rarityInfo, type Rarity } from '../content/rarity';
import { logError, logInfo } from './logger';

/** Application emoji per icon key, loaded at startup. Missing icons fall back to standard emojis. */
const loaded = new Map<string, { id: string; name: string }>();

export async function loadIcons(client: Client<true>): Promise<void> {
  try {
    const emojis = await client.application.emojis.fetch();
    for (const e of emojis.values()) {
      if (!e.name?.startsWith(EMOJI_PREFIX)) continue;
      const key = e.name.slice(EMOJI_PREFIX.length).replace(/_[0-9a-f]{6}$/, '');
      loaded.set(key, { id: e.id, name: e.name });
    }
    const missing = Object.keys(iconDefs).filter((k) => !loaded.has(k));
    logInfo('icons', `${loaded.size} icons loaded${missing.length ? `; using fallback emojis for ${missing.join(', ')}` : ''}`);
  } catch (err) {
    logError('icons', err);
  }
}

/** Inline icon for embeds and button labels: `<:oi_mine_abc123:123…>` or the fallback emoji. */
export function icon(key: IconKey): string {
  const e = loaded.get(key);
  return e ? `<:${e.name}:${e.id}>` : iconDefs[key].fallback;
}

/** Icon in the shape select-menu options and buttons expect. */
export function iconEmoji(key: IconKey): { id: string; name: string } | { name: string } {
  return loaded.get(key) ?? { name: iconDefs[key].fallback };
}

export function rarityIcon(rarity: Rarity): string {
  return icon(rarity);
}

/** "◆ Rare" style label: rarity icon plus name. */
export function rarityTag(rarity: Rarity): string {
  return `${rarityIcon(rarity)} ${rarityInfo[rarity].label}`;
}

/** For tests: pretend these icons were uploaded. */
export function setLoadedIconsForTest(entries: Record<string, { id: string; name: string }>): void {
  loaded.clear();
  for (const [k, v] of Object.entries(entries)) loaded.set(k, v);
}

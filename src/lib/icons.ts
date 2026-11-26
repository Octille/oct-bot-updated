import type { Client } from 'discord.js';
import { EMOJI_PREFIX, iconDefs, VARIANT_CODE, type IconKey, type IconVariant } from '../content/icons';
import { rarityInfo, type Rarity } from '../content/rarity';
import { logError, logInfo } from './logger';

/** Application emojis by `<key>.<variant code>`, loaded at startup. Missing ones fall back to standard emojis. */
const loaded = new Map<string, { id: string; name: string }>();
const NAME = new RegExp(`^${EMOJI_PREFIX}(.+)_([bwgc])_[0-9a-f]{6}$`);

export async function loadIcons(client: Client<true>): Promise<void> {
  try {
    const emojis = await client.application.emojis.fetch();
    for (const e of emojis.values()) {
      const m = e.name ? NAME.exec(e.name) : null;
      if (m) loaded.set(`${m[1]}.${m[2]}`, { id: e.id, name: e.name! });
    }
    const missing = Object.keys(iconDefs).filter((k) => ![...'bwgc'].some((v) => loaded.has(`${k}.${v}`)));
    logInfo('icons', `${loaded.size} icon emojis loaded${missing.length ? `; using fallback emojis for ${missing.join(', ')}` : ''}`);
  } catch (err) {
    logError('icons', err);
  }
}

function lookup(key: IconKey, variant: IconVariant) {
  const fixed = 'color' in iconDefs[key] && iconDefs[key].color;
  return loaded.get(`${key}.${fixed ? VARIANT_CODE.fixed : VARIANT_CODE[variant]}`);
}

/** Whether this icon's application emoji is uploaded (so pieces that must tile, like the music bar, can fall back together). */
export function hasIcon(key: IconKey): boolean {
  return !!lookup(key, 'grey');
}

function inline(key: IconKey, variant: IconVariant): string {
  const e = lookup(key, variant);
  return e ? `<:${e.name}:${e.id}>` : iconDefs[key].fallback;
}

/** Inline icon in embed text (neutral grey). Rarity and badge icons keep their own colours. */
export function icon(key: IconKey): string {
  return inline(key, 'grey');
}

/** Screen title icon (brand colour). */
export function titleIcon(key: IconKey): string {
  return inline(key, 'brand');
}

/** Icon for a green or blue button (white, matching the label). Grey buttons never get icons (except the music panel). */
export function buttonIcon(key: IconKey): string {
  return inline(key, 'white');
}

/** Icon for a grey music-panel button (grey #80848e, readable on light and dark). */
export function greyButtonIcon(key: IconKey): string {
  return inline(key, 'grey');
}

export function rarityIcon(rarity: Rarity): string {
  return icon(rarity);
}

/** Rarity icon plus name. */
export function rarityTag(rarity: Rarity): string {
  return `${rarityIcon(rarity)} ${rarityInfo[rarity].label}`;
}

/** For tests: pretend these icons were uploaded (`<key>.<variant code>` → emoji). */
export function setLoadedIconsForTest(entries: Record<string, { id: string; name: string }>): void {
  loaded.clear();
  for (const [k, v] of Object.entries(entries)) loaded.set(k, v);
}

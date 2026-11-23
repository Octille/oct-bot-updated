import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import { icon } from './icons';
import { BRAND } from '../content/icons';

/** Every screen uses the brand colour; only success / warning / error results differ. */
export const palette = {
  economy: BRAND,
  gambling: BRAND,
  social: BRAND,
  levels: BRAND,
  events: BRAND,
  music: BRAND,
  moderation: BRAND,
  utility: BRAND,
  success: 0x23a55a,
  warning: 0xf0b232,
  error: 0xf23f43,
} as const satisfies Record<string, ColorResolvable>;

export type Category = keyof typeof palette;

export function embed(category: Category = 'utility'): EmbedBuilder {
  return new EmbedBuilder().setColor(palette[category]);
}

export function successEmbed(description: string): EmbedBuilder {
  return embed('success').setDescription(`${icon('success')} ${description}`);
}

export function errorEmbed(description: string): EmbedBuilder {
  return embed('error').setDescription(`${icon('error')} ${description}`);
}

export function warningEmbed(description: string): EmbedBuilder {
  return embed('warning').setDescription(`${icon('warning')} ${description}`);
}

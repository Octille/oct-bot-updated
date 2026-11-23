import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import { icon } from './icons';

export const palette = {
  economy: 0xf1c40f,
  gambling: 0x9b59b6,
  social: 0xe91e63,
  levels: 0x3498db,
  events: 0xe67e22,
  music: 0x1db954,
  moderation: 0xe74c3c,
  utility: 0x95a5a6,
  success: 0x2ecc71,
  error: 0xed4245,
  warning: 0xfee75c,
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

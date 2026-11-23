import { ActionRowBuilder, ButtonBuilder, type ButtonStyle } from 'discord.js';
import type { LevelUp } from '../services/progression';
import { makeId } from './customId';

/** "Level 5! Unlocked: …" or null. */
export function levelUpText(levelUp: LevelUp | null): string | null {
  if (!levelUp) return null;
  const unlocks = levelUp.unlocks.length ? ` Unlocked: ${levelUp.unlocks.join(', ')}.` : '';
  return `**Level ${levelUp.to}!**${unlocks}`;
}

export function button(prefix: string, ownerId: string, args: (string | number)[], label: string, style: ButtonStyle, emoji?: string, disabled = false): ButtonBuilder {
  const b = new ButtonBuilder().setCustomId(makeId(prefix, ownerId, ...args)).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

/** Splits buttons into rows of five. */
export function rows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const out: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) out.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  return out;
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { makeId } from '../lib/customId';
import type { Profile } from '../services/economy';

/**
 * Menu building blocks. Every menu screen is a pure function of (path, profile) → Payload, and the
 * path lives in the button's custom ID, so menus survive restarts and Back is just the parent path.
 *
 * Button order everywhere: [Back] (grey) → other navigation (grey) → main action (green) → cancel (red).
 * Buttons are text only; an icon is allowed only on main actions and hub activities (never on Back/Menu/Prev/Next).
 */

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;
export interface Payload {
  embeds: EmbedBuilder[];
  components: Row[];
}

/** Where a menu was opened from: the /menu hub (Back returns there) or a slash command. */
export type Origin = 'h' | 'c';

export interface ScreenCtx {
  owner: string;
  origin: Origin;
  profile: Profile;
  userName: string;
  /** Result of the last action, shown at the top. */
  note?: string;
}

/** Labels stay short so they aren't cut off on mobile; details go in the embed. */
export const MAX_LABEL = 30;
/** Select menus show at most this many options before paging or filtering. */
export const MAX_OPTIONS = 10;

export function fit(label: string, max = MAX_LABEL): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

export const ids = {
  /** Navigate to a screen. */
  nav: (owner: string, origin: Origin, path: string) => makeId('ui', owner, origin, path),
  /** A select menu that navigates: the chosen value is appended to `path`. (Distinct from nav so it never clashes with a Back button.) */
  pick: (owner: string, origin: Origin, path: string) => makeId('ui', owner, origin, path, 'pick'),
  /** Do something, then show a screen. */
  act: (owner: string, origin: Origin, path: string, action: string, ...args: (string | number)[]) =>
    makeId('ua', owner, origin, path, action, ...args),
  /** Start an activity or open the hub as a new message. */
  go: (owner: string, target: string, ...args: (string | number)[]) => makeId('go', owner, target, ...args),
};

export const MAIN = ButtonStyle.Success;
export const NAV = ButtonStyle.Secondary;
export const DANGER = ButtonStyle.Danger;

export function btn(customId: string, label: string, style: ButtonStyle, opts: { emoji?: string; disabled?: boolean } = {}): ButtonBuilder {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(fit(label)).setStyle(style).setDisabled(!!opts.disabled);
  if (opts.emoji) b.setEmoji(opts.emoji);
  return b;
}

export function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(components);
}

export interface Option {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}

export function select(customId: string, placeholder: string, options: Option[]): Row {
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(fit(placeholder, 100)).addOptions(
    options.map((o) => ({
      label: fit(o.label, 100),
      value: o.value,
      description: o.description ? fit(o.description, 100) : undefined,
      emoji: o.emoji ? parseEmoji(o.emoji) : undefined,
      default: o.default,
    })),
  );
  return row(menu);
}

/**
 * The Back button: to the parent screen, or for top-level screens back to the hub
 * (when opened from it) or a Menu button that opens the hub.
 */
export function back(ctx: Pick<ScreenCtx, 'owner' | 'origin'>, parent: string | null): ButtonBuilder {
  if (parent) return btn(ids.nav(ctx.owner, ctx.origin, parent), 'Back', NAV);
  if (ctx.origin === 'h') return btn(ids.nav(ctx.owner, 'h', 'hub'), 'Back', NAV);
  return btn(ids.go(ctx.owner, 'menu'), 'Menu', NAV);
}

/** `<:name:id>` → { id, name }; anything else is a unicode emoji. */
export function parseEmoji(emoji: string): { id: string; name: string } | { name: string } {
  const m = /^<a?:(\w+):(\d+)>$/.exec(emoji);
  return m ? { name: m[1]!, id: m[2]! } : { name: emoji };
}

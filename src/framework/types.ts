import type {
  AnySelectMenuInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Category } from '../lib/embeds';
import type { ParsedId } from '../lib/customId';
import type { Profile } from '../services/economy';

export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  client: Client<true>;
  /** The invoking user's profile, created silently if it didn't exist. */
  profile: Profile;
}

export interface SlashCommand {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  category: Category;
  /** Defer before running: public, ephemeral, or not at all (fast commands). */
  defer?: 'public' | 'ephemeral' | false;
  guildOnly?: boolean;
  ownerOnly?: boolean;
  /** Refuse while the user is in jail. */
  blockedInJail?: boolean;
  /** Persistent cooldown, claimed before running and refunded if the command throws. */
  cooldown?: { key: string; seconds: number };
  execute(ctx: CommandContext): Promise<unknown>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<unknown>;
}

export type ComponentInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export interface ComponentContext<I extends ComponentInteraction = ComponentInteraction> {
  interaction: I;
  client: Client<true>;
  id: ParsedId;
  profile: Profile;
}

/**
 * Handles persistent components (role panels, ticket buttons, drop claims...) by customId prefix.
 * Short-lived game UIs use collectors instead, with prefixes starting `~` (see lib/collect.ts).
 */
export interface ComponentHandler {
  prefix: string;
  execute(ctx: ComponentContext): Promise<unknown>;
}

export function defineCommand(command: SlashCommand): SlashCommand {
  return command;
}

export function defineComponent(handler: ComponentHandler): ComponentHandler {
  if (handler.prefix.startsWith('~')) throw new Error('`~` prefixes are reserved for collector-managed components');
  return handler;
}

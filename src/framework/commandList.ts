import type { ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommand } from './types';

/**
 * Leaf module (no runtime imports) so menus can look up commands without import cycles.
 * framework/registry.ts fills the list; framework/router.ts registers the runner.
 */
let list: readonly SlashCommand[] = [];
let runner: ((interaction: ChatInputCommandInteraction, command: SlashCommand) => Promise<void>) | null = null;

export function setCommandList(commands: readonly SlashCommand[]): void {
  list = commands;
}

export function getCommandList(): readonly SlashCommand[] {
  return list;
}

export function findCommand(name: string): SlashCommand | undefined {
  return list.find((c) => c.data.name === name);
}

export function setCommandRunner(run: typeof runner): void {
  runner = run;
}

export async function runRegisteredCommand(interaction: ChatInputCommandInteraction, command: SlashCommand): Promise<void> {
  if (!runner) throw new Error('Command runner not registered');
  await runner(interaction, command);
}

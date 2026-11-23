import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { UserError } from '../lib/errors';
import { findCommand, runRegisteredCommand } from './commandList';

/**
 * Runs a slash command from a button press (hub and "next step" buttons). Only commands that
 * need no options can be launched this way; the button interaction stands in for the slash command.
 */
export async function launchCommand(name: string, interaction: ButtonInteraction): Promise<void> {
  const command = findCommand(name);
  if (!command) throw new UserError('That activity is no longer available.');
  const noOptions = {
    getUser: () => null,
    getString: () => null,
    getInteger: () => null,
    getSubcommand: () => { throw new UserError(`Run \`/${name}\` as a slash command for that.`); },
  };
  const proxy = new Proxy(interaction, {
    get(target, prop) {
      if (prop === 'options') return noOptions;
      if (prop === 'commandName') return name;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await runRegisteredCommand(proxy as unknown as ChatInputCommandInteraction, command);
}

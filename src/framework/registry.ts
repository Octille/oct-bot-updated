import { Collection } from 'discord.js';
import type { ComponentHandler, SlashCommand } from './types';
import { commands } from '../commands';
import { components } from '../components';
import { setCommandList } from './commandList';

export const commandRegistry = new Collection<string, SlashCommand>();
export const componentRegistry = new Collection<string, ComponentHandler>();

for (const command of commands) {
  if (commandRegistry.has(command.data.name)) throw new Error(`Duplicate command /${command.data.name}`);
  commandRegistry.set(command.data.name, command);
}
setCommandList(commands);

for (const handler of components) {
  if (componentRegistry.has(handler.prefix)) throw new Error(`Duplicate component prefix "${handler.prefix}"`);
  componentRegistry.set(handler.prefix, handler);
}

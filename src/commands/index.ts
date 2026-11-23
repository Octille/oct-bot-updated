import type { SlashCommand } from '../framework/types';
import ping from './utility/ping';

/** Every slash command. Add new commands here. */
export const commands: SlashCommand[] = [ping];

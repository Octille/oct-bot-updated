import type { ComponentInteraction } from '../../framework/types';
import type { Payload, ScreenCtx } from '../kit';

export type ActResult =
  /** Show this screen, with an optional result note. */
  | { path: string; note?: string }
  /** The action already responded (e.g. opened a modal). */
  | { handled: true };

export interface ScreenModule {
  render(path: string[], ctx: ScreenCtx): Payload;
  act?(path: string[], action: string, args: string[], interaction: ComponentInteraction, ctx: ScreenCtx): Promise<ActResult>;
}

import type { ComponentHandler } from '../framework/types';
import { uiHandlers } from '../ui/handlers';

/** Persistent component handlers (menus, hub, next-step buttons; later role panels, tickets, drops). */
export const components: ComponentHandler[] = [...uiHandlers];

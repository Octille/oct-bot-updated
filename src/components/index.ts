import type { ComponentHandler } from '../framework/types';
import { uiHandlers } from '../ui/handlers';
import { catchHandler } from './rob';
import { remindersHandler } from './reminders';
import { dropHandler } from './drops';
import { musicPanelHandler } from './music';
import { rolePanelHandler } from './rolePanel';
import { ticketHandler } from './tickets';
import { settingsHandler } from './settings';
import { radioHandler } from './radio';

/** Persistent component handlers (menus, hub, next-step buttons; later role panels, tickets, drops). */
export const components: ComponentHandler[] = [...uiHandlers, catchHandler, remindersHandler, dropHandler, musicPanelHandler, rolePanelHandler, ticketHandler, settingsHandler, radioHandler];

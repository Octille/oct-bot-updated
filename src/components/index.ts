import type { ComponentHandler } from '../framework/types';
import { uiHandlers } from '../ui/handlers';
import { catchHandler } from './rob';
import { remindersHandler } from './reminders';
import { dropHandler } from './drops';
import { musicPanelHandler } from './music';
import { rolePanelHandler } from './rolePanel';
import { settingsHandler } from './settings';

/** Persistent component handlers (menus, hub, next-step buttons; role panels, drops). */
export const components: ComponentHandler[] = [...uiHandlers, catchHandler, remindersHandler, dropHandler, musicPanelHandler, rolePanelHandler, settingsHandler];

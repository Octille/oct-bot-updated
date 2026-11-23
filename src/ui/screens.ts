import type { Payload, ScreenCtx } from './kit';
import type { ScreenModule } from './screens/types';
import { hub } from './screens/hub';
import { shop } from './screens/shop';
import { inventory } from './screens/inventory';
import { wardrobe } from './screens/wardrobe';
import { balance } from './screens/balance';
import { job } from './screens/job';
import { fishdex } from './screens/fishdex';
import { help } from './screens/help';
import { jail } from './screens/jail';
import { achievementsScreen } from './screens/achievements';
import { prestigeScreen } from './screens/prestige';

/** Screen modules by the first segment of their path. */
export const screens: Record<string, ScreenModule> = {
  hub, shop, inv: inventory, wardrobe, bal: balance, job, dex: fishdex, help, jail, ach: achievementsScreen, prestige: prestigeScreen,
};

export function moduleFor(path: string): ScreenModule {
  return screens[path.split('.')[0] ?? ''] ?? hub;
}

export function render(path: string, ctx: ScreenCtx): Payload {
  return moduleFor(path).render(path.split('.'), ctx);
}

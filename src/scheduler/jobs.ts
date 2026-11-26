import type { Job } from './index';
import { voiceXpJob } from './voiceXp';
import { robSweepJob } from './robSweep';
import { remindersJob } from './reminders';
import { eventsHourlyJob, eventsMinuteJob } from './events';
import { snapshotSupply } from '../services/ecoStats';
import { cleanupLegacyProfiles } from '../services/legacyCleanup';
import { logNotice } from '../lib/logger';

/** Money supply at the start of each UTC day, for /eco stats. */
const supplySnapshotJob: Job = { name: 'supply snapshot', schedule: '1 0 * * *', run: () => snapshotSupply() };

/** v2 profiles never imported are deleted 12 months after LAUNCH_DATE (docs/PRIVACY.md). */
const legacyCleanupJob: Job = {
  name: 'v2 profile cleanup',
  schedule: '30 3 * * *',
  run: async () => {
    const n = await cleanupLegacyProfiles();
    if (n) logNotice('v2 cleanup', `deleted ${n} old v2 profiles that were never imported`);
  },
};

/** All scheduled jobs. Each feature phase adds its jobs here. */
export const jobs: Job[] = [voiceXpJob, robSweepJob, remindersJob, eventsHourlyJob, eventsMinuteJob, supplySnapshotJob, legacyCleanupJob];

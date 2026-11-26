import type { Job } from './index';
import { voiceXpJob } from './voiceXp';
import { robSweepJob } from './robSweep';
import { remindersJob } from './reminders';
import { eventsHourlyJob, eventsMinuteJob } from './events';
import { snapshotSupply } from '../services/ecoStats';

/** Money supply at the start of each UTC day, for /eco stats. */
const supplySnapshotJob: Job = { name: 'supply snapshot', schedule: '1 0 * * *', run: () => snapshotSupply() };

/** All scheduled jobs. Each feature phase adds its jobs here. */
export const jobs: Job[] = [voiceXpJob, robSweepJob, remindersJob, eventsHourlyJob, eventsMinuteJob, supplySnapshotJob];

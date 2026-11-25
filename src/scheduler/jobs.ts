import type { Job } from './index';
import { voiceXpJob } from './voiceXp';
import { robSweepJob } from './robSweep';
import { remindersJob } from './reminders';
import { eventsHourlyJob, eventsMinuteJob } from './events';

/** All scheduled jobs. Each feature phase adds its jobs here. */
export const jobs: Job[] = [voiceXpJob, robSweepJob, remindersJob, eventsHourlyJob, eventsMinuteJob];

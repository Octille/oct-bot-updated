import type { Job } from './index';
import { voiceXpJob } from './voiceXp';

/** All scheduled jobs. Each feature phase adds its jobs here. */
export const jobs: Job[] = [voiceXpJob];

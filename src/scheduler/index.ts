import cron, { type ScheduledTask } from 'node-cron';
import type { Client } from 'discord.js';
import { logError, logInfo } from '../lib/logger';

export interface Job {
  name: string;
  /** Cron expression (UTC), e.g. `*\/5 * * * *` */
  schedule: string;
  run(client: Client<true>): Promise<void>;
}

const tasks: ScheduledTask[] = [];

/** Starts every job. A job never overlaps with itself; errors are logged, never thrown. */
export function startScheduler(client: Client<true>, jobs: Job[]): void {
  for (const job of jobs) {
    let running = false;
    const task = cron.schedule(job.schedule, async () => {
      if (running) return;
      running = true;
      try {
        await job.run(client);
      } catch (err) {
        logError(`job ${job.name}`, err);
      } finally {
        running = false;
      }
    }, { timezone: 'UTC', name: job.name });
    tasks.push(task);
  }
  logInfo('scheduler', `${jobs.length} job(s) scheduled`);
}

export function stopScheduler(): void {
  for (const task of tasks.splice(0)) task.stop();
}

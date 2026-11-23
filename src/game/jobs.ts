import { getJob, rankFor, type Job } from '../content/jobs';

export const PERFECT_BONUS = 1.1;

export function shiftsIn(shifts: Record<string, number> | undefined, jobId: string): number {
  return shifts?.[jobId] ?? 0;
}

/** Coins for one shift. */
export function shiftPay(job: Job, shiftsWorked: number, perf: number, incomeMult: number, perfect: boolean): number {
  const rank = rankFor(shiftsWorked);
  return Math.max(1, Math.round(job.basePay * rank.mult * perf * incomeMult * (perfect ? PERFECT_BONUS : 1)));
}

export { getJob };

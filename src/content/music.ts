/** Music settings. */
export const musicRules = {
  /** Leave this long after the queue ends. */
  idleLeaveMs: 3 * 60_000,
  /** Leave this long after everyone else left the voice channel. */
  aloneLeaveMs: 2 * 60_000,
  maxQueue: 500,
  maxVolume: 150,
  defaultVolume: 80,
  queuePerPage: 10,
} as const;

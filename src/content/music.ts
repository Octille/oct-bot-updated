/** Music settings. */
export const musicRules = {
  /** Leave this long after the queue ends. */
  idleLeaveMs: 3 * 60_000,
  /** Leave this long after everyone else left the voice channel. */
  aloneLeaveMs: 2 * 60_000,
  maxQueue: 500,
  maxVolume: 100,
  defaultVolume: 80,
  queuePerPage: 10,
  /** Broken tracks allowed per minute before the player gives up. */
  maxErrorsPerMinute: 10,
  /** Back restarts the song after this far in, otherwise plays the previous one. */
  backRestartMs: 5_000,
  historySize: 20,
  /** The now-playing panel refreshes this often while playing. */
  panelRefreshMs: 15_000,
  /** Panel edits per second across all servers (Discord allows ~50 requests/s per bot in total). */
  panelEditsPerSecond: 5,
  /** Progress bar width in emoji pieces. */
  barSegments: 14,
} as const;

import type { Track } from 'lavalink-client';
import { musicRules } from '../content/music';

/**
 * Play history per server for the Back button (newest first, at most `musicRules.historySize`).
 * Kept here rather than in lavalink-client's `queue.previous`, which gains a copy of the track on
 * every repeat while looping a track.
 */
interface History {
  last: Track | null;
  past: Track[];
  /** The next start came from Back: the track it replaced went back into the queue, not the history. */
  fromBack: boolean;
}

const histories = new Map<string, History>();

function get(guildId: string): History {
  let h = histories.get(guildId);
  if (!h) histories.set(guildId, (h = { last: null, past: [], fromBack: false }));
  return h;
}

/** Called on every track start. A track looping onto itself isn't a new entry. */
export function recordStart(guildId: string, track: Track, loopingTrack: boolean): void {
  const h = get(guildId);
  if (h.last && loopingTrack && h.last.encoded === track.encoded && !h.fromBack) return;
  if (h.last && !h.fromBack) {
    h.past.unshift(h.last);
    h.past.length = Math.min(h.past.length, musicRules.historySize);
  }
  h.fromBack = false;
  h.last = track;
}

/** Takes the previous track for Back (and marks the next start as coming from Back). */
export function takePrevious(guildId: string): Track | undefined {
  const h = get(guildId);
  const t = h.past.shift();
  if (t) h.fromBack = true;
  return t;
}

export function hasHistory(guildId: string): boolean {
  return (histories.get(guildId)?.past.length ?? 0) > 0;
}

export function clearHistory(guildId: string): void {
  histories.delete(guildId);
}

import type { Track } from 'lavalink-client';
import { logError } from '../lib/logger';

/**
 * YouTube is used behind the scenes to play songs (found via YouTube Music search). Players never
 * see it: YouTube links stay refused, and YouTube URLs are never shown. When YouTube refuses the
 * server (bot check, sign-in wall, rate limit) or keeps failing, it's skipped for a while and
 * SoundCloud is used instead, with one clear log line.
 */
export const youtubeRules = {
  /** How long YouTube is skipped after it blocks us. */
  cooldownMs: 15 * 60_000,
  /** This many playback failures within `failureWindowMs` count as blocked too. */
  failuresToBlock: 3,
  failureWindowMs: 10 * 60_000,
} as const;

const BLOCKED = /sign in|not a bot|login.?required|requires login|429|too many requests|captcha|unusual traffic/i;

let blockedUntil = 0;
let failures: number[] = [];

export const isYouTube = (t: Track) => t.info.sourceName === 'youtube';

/** False while YouTube is being skipped after a block. */
export function youtubeUsable(now = Date.now()): boolean {
  return now >= blockedUntil;
}

function block(reason: string, now: number): void {
  if (now >= blockedUntil) {
    logError('YouTube blocked', new Error(
      `YouTube is refusing this server (${reason.slice(0, 200)}). Using SoundCloud only for the next ${youtubeRules.cooldownMs / 60_000} minutes. ` +
      'If this keeps happening, refresh the YouTube sign-in (docs/DEPLOY.md, "YouTube sign-in").',
    ));
  }
  blockedUntil = now + youtubeRules.cooldownMs;
  failures = [];
}

/** A YouTube search or playback error. Blocks YouTube for a while on a bot check / sign-in wall / rate limit, or after repeated failures. Returns true when YouTube is now skipped. */
export function noteYouTubeError(message: string, now = Date.now()): boolean {
  if (BLOCKED.test(message)) {
    block(message, now);
    return true;
  }
  failures = [...failures.filter((t) => now - t < youtubeRules.failureWindowMs), now];
  if (failures.length >= youtubeRules.failuresToBlock) {
    block(`${failures.length} failures in ${youtubeRules.failureWindowMs / 60_000} minutes, last: ${message}`, now);
    return true;
  }
  return false;
}

/** Tests only. */
export function resetYouTube(): void {
  blockedUntil = 0;
  failures = [];
}

import type { Player } from 'lavalink-client';
import { UserError } from '../lib/errors';
import { escapeTitle } from './panel';
import { musicRules } from '../content/music';

/** Shared player actions for /music and the panel buttons. Each returns a short confirmation. */
export async function togglePause(player: Player): Promise<string> {
  if (player.paused) {
    await player.resume();
    return 'Resumed.';
  }
  await player.pause();
  return 'Paused.';
}

export async function skip(player: Player): Promise<string> {
  const title = escapeTitle(player.queue.current?.info.title ?? 'the track');
  if (!player.queue.tracks.length) {
    await player.stopPlaying(true, false);
    return `Skipped **${title}**. The queue is empty now.`;
  }
  await player.skip();
  return `Skipped **${title}**.`;
}

export async function stop(player: Player): Promise<string> {
  await player.destroy('stopped');
  return 'Stopped and left the voice channel.';
}

const NEXT_LOOP = { off: 'track', track: 'queue', queue: 'off' } as const;

export async function cycleLoop(player: Player, mode?: 'off' | 'track' | 'queue'): Promise<string> {
  const next = mode ?? NEXT_LOOP[player.repeatMode];
  await player.setRepeatMode(next);
  return next === 'off' ? 'Looping off.' : `Looping the ${next}.`;
}

export async function shuffle(player: Player): Promise<string> {
  if (player.queue.tracks.length < 2) throw new UserError('Add a few more songs first.');
  await player.queue.shuffle();
  return `Shuffled ${player.queue.tracks.length} tracks.`;
}

export async function setVolume(player: Player, volume: number): Promise<string> {
  const v = Math.max(0, Math.min(musicRules.maxVolume, Math.round(volume)));
  await player.setVolume(v);
  return `Volume ${v}%.`;
}

/** "1:23", "83" or "1:02:03" → milliseconds. */
export function parsePosition(input: string): number | null {
  const parts = input.trim().split(':').map((x) => Number(x));
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

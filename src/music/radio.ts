import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { logError } from '../lib/logger';
import { isPublicHttpsUrl } from './sources';

/** Stations live in config/radio.json so they can be edited without touching code (re-read when the file changes). */
export const RADIO_FILE = join(__dirname, '..', '..', 'config', 'radio.json');

const stationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(80),
  genre: z.string(),
  url: z.string().refine(isPublicHttpsUrl, 'must be a public https URL'),
  website: z.string().url().optional(),
  /** Who allowed rebroadcasting, and when/where. Without it the station is test-bot only. */
  permission: z.string().min(1).nullable().default(null),
});
const fileSchema = z.object({ genres: z.record(z.string(), z.string()), stations: z.array(stationSchema) });

export type Station = z.infer<typeof stationSchema>;
export type RadioConfig = z.infer<typeof fileSchema>;

let cache: { mtime: number; config: RadioConfig } | null = null;

export function parseRadioConfig(raw: unknown): RadioConfig {
  const config = fileSchema.parse(raw);
  const ids = new Set<string>();
  for (const s of config.stations) {
    if (!config.genres[s.genre]) throw new Error(`Station "${s.id}" has unknown genre "${s.genre}"`);
    if (ids.has(s.id)) throw new Error(`Duplicate station id "${s.id}"`);
    ids.add(s.id);
  }
  return config;
}

/** The current station list (the last good one if the file has a mistake, which is logged). */
export function radioConfig(file = RADIO_FILE): RadioConfig {
  try {
    const mtime = statSync(file).mtimeMs;
    if (cache?.mtime === mtime) return cache.config;
    const config = parseRadioConfig(JSON.parse(readFileSync(file, 'utf8')));
    cache = { mtime, config };
    return config;
  } catch (err) {
    logError('radio config', err);
    return cache?.config ?? { genres: {}, stations: [] };
  }
}

/** Radio info carried on the track, so the now-playing panel shows the station instead of the stream's own title. */
export interface RadioInfo { id: string; name: string; genre: string; website?: string }

export function radioOf(track: { userData?: unknown }): RadioInfo | null {
  const r = (track.userData as { radio?: RadioInfo } | undefined)?.radio;
  return r?.name ? r : null;
}

/** Stations this bot may play: only ones with recorded permission, plus the rest on the test bot. */
export function availableStations(config: RadioConfig, testBot: boolean): Station[] {
  return config.stations.filter((s) => s.permission || testBot);
}

import type { Track } from 'lavalink-client';
import { formatTime } from './panel';
import { isPreviewOnly, mainArtist, normalize, rankSearch } from './sources';
import { lavalink, nodeReady } from './manager';
import { env } from '../config/env';

/** Spotify search and links need the app keys (Lavalink's LavaSrc reads the same ones). */
export const spotifyEnabled = () => !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);

/**
 * /play autocomplete. With Spotify keys: Spotify's catalog, re-ranked by popularity (Deezer's public
 * rank, since Spotify no longer gives apps one); picking one finds that exact song on SoundCloud (play.ts). Without them, or when
 * Spotify search fails: SoundCloud results, ranked like a submitted search.
 * Discord drops an autocomplete reply after ~3 s, so results are cached per query, the same query
 * is never searched twice at once, and a slow search answers with what's cached instead of failing.
 */
export const suggestRules = {
  minChars: 2,
  max: 10,
  cacheMs: 60_000,
  /** Answer by then; the search keeps going and fills the cache for the next keystroke. */
  deadlineMs: 2_200,
  /** Suggestion values longer than Discord's 100 characters become a short key, valid this long. */
  keyMs: 10 * 60_000,
  /** A search still running after this is abandoned, so a hung request can't block its query. */
  giveUpMs: 10_000,
  maxCached: 500,
} as const;

export type SuggestSource = 'spsearch' | 'scsearch';
type Search = (query: string, source: SuggestSource) => Promise<Track[]>;

const cache = new Map<string, { at: number; tracks: Track[] }>();
const inflight = new Map<string, Promise<Track[]>>();
const keys = new Map<string, { uri: string; at: number }>();
let keySeq = 0;

export const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/** A search on any connected node, without a player (nobody is in voice yet). */
const nodeSearch: Search = async (query, source) => {
  const node = lavalink()?.nodeManager.leastUsedNodes()[0];
  if (!node || !nodeReady()) return [];
  const res = await node.search({ query, source }, null);
  if (res.loadType !== 'search' && res.loadType !== 'track') return [];
  return (res.tracks as Track[]).filter((t) => !t.info.isStream && !isPreviewOnly(t));
};

function prune(now: number): void {
  if (cache.size > suggestRules.maxCached) for (const [k, v] of cache) if (now - v.at > suggestRules.cacheMs) cache.delete(k);
  for (const [k, v] of keys) if (now - v.at > suggestRules.keyMs) keys.delete(k);
}

/** Cached results for a query (fresh within cacheMs), sharing one search between concurrent callers. */
export async function cachedSearch(query: string, source: SuggestSource, search: Search = nodeSearch, now = Date.now()): Promise<Track[]> {
  const key = `${source}|${normalizeQuery(query)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < suggestRules.cacheMs) return hit.tracks;
  let pending = inflight.get(key);
  if (!pending) {
    let timer: NodeJS.Timeout | undefined;
    pending = Promise.race([
      search(query, source),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('search timed out')), suggestRules.giveUpMs); }),
    ])
      .then((tracks) => {
        cache.set(key, { at: Date.now(), tracks });
        prune(Date.now());
        return tracks;
      })
      .finally(() => {
        clearTimeout(timer);
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }
  return pending;
}

/** The best cached results while a search is slow: this query (even stale), else the longest cached prefix of it. */
function fallback(query: string, source: SuggestSource): Track[] {
  const key = `${source}|${normalizeQuery(query)}`;
  const exact = cache.get(key);
  if (exact) return exact.tracks;
  let best: { len: number; tracks: Track[] } | null = null;
  for (const [k, v] of cache) if (key.startsWith(k) && k.length > (best?.len ?? 0)) best = { len: k.length, tracks: v.tracks };
  return best?.tracks ?? [];
}

/** A suggestion's value: the track's URL, or a short key when the URL is too long for Discord. */
export function choiceValue(uri: string, now = Date.now()): string {
  if (uri.length <= 100) return uri;
  const key = `sc:${(++keySeq).toString(36)}`;
  keys.set(key, { uri, at: now });
  return key;
}

/** The URL behind a short key; undefined when the value isn't a key, null when the key expired. */
export function resolveChoice(value: string, now = Date.now()): string | null | undefined {
  if (!/^sc:[0-9a-z]+$/.test(value)) return undefined;
  const k = keys.get(value);
  return k && now - k.at <= suggestRules.keyMs ? k.uri : null;
}

/** "Title - Uploader [m:ss]", shortening the title to fit Discord's 100 characters. */
export function choiceName(t: Track): string {
  const tail = ` - ${t.info.author} [${t.info.duration ? formatTime(t.info.duration) : '?'}]`.slice(0, 60);
  const room = 100 - tail.length;
  const title = t.info.title.length > room ? `${t.info.title.slice(0, room - 1)}…` : t.info.title;
  return title + tail;
}

/** Results for one source within `deadlineMs`: fresh or shared search, else what's cached. Never throws. */
async function within(q: string, source: SuggestSource, search: Search, deadlineMs: number): Promise<Track[]> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      cachedSearch(q, source, search),
      new Promise<Track[]>((resolve) => { timer = setTimeout(() => resolve(fallback(q, source)), deadlineMs); }),
    ]);
  } catch {
    return fallback(q, source);
  } finally {
    clearTimeout(timer);
  }
}

/** The same song listed twice by Spotify (single and album release): same title, artist and length to the second. */
function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const k = `${normalizeQuery(t.info.title)}|${normalizeQuery(t.info.author)}|${Math.round((t.info.duration ?? 0) / 1000)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ── Popularity: Deezer's public search has a `rank` per track (no key needed) ─────────────────── */

export interface Popularity { title: string; artist: string; rank: number }
type Ranker = (query: string) => Promise<Popularity[]>;

const deezerRanks: Ranker = async (query) => {
  const res = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q: query, limit: '25' })}`, { signal: AbortSignal.timeout(suggestRules.giveUpMs) });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: { title?: string; artist?: { name?: string }; rank?: number }[] };
  return (body.data ?? [])
    .filter((d) => d.title && d.artist?.name && typeof d.rank === 'number')
    .map((d) => ({ title: d.title!, artist: d.artist!.name!, rank: d.rank! }));
};

const rankCache = new Map<string, { at: number; ranks: Popularity[] }>();
const rankInflight = new Map<string, Promise<Popularity[]>>();

/** Popularity for a query within `deadlineMs` (cached 60 s, one lookup per query at a time); [] when slow or down. */
async function ranksWithin(query: string, ranker: Ranker, deadlineMs: number): Promise<Popularity[]> {
  const key = normalizeQuery(query);
  const now = Date.now();
  const hit = rankCache.get(key);
  if (hit && now - hit.at < suggestRules.cacheMs) return hit.ranks;
  let pending = rankInflight.get(key);
  if (!pending) {
    pending = ranker(query)
      .then((ranks) => {
        rankCache.set(key, { at: Date.now(), ranks });
        if (rankCache.size > suggestRules.maxCached) for (const [k, v] of rankCache) if (Date.now() - v.at > suggestRules.cacheMs) rankCache.delete(k);
        return ranks;
      })
      .finally(() => rankInflight.delete(key));
    rankInflight.set(key, pending);
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([pending, new Promise<Popularity[]>((resolve) => { timer = setTimeout(() => resolve(hit?.ranks ?? []), deadlineMs); })]);
  } catch {
    return hit?.ranks ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Spotify's results, popular songs first among the close matches: 40% Spotify's relevance order,
 * 60% popularity (the song's rank on Deezer by title and main artist, relative to the most popular
 * one found). Songs Deezer doesn't know keep their relevance only. Without popularity data: Spotify's order.
 */
export function rerankByPopularity(tracks: Track[], ranks: Popularity[]): Track[] {
  if (!ranks.length || !tracks.length) return tracks;
  const key = (title: string, artist: string) => `${normalize(title)}|${normalize(mainArtist(artist))}`;
  const best = new Map<string, number>();
  for (const r of ranks) {
    const k = key(r.title, r.artist);
    best.set(k, Math.max(best.get(k) ?? 0, r.rank));
  }
  const top = Math.max(...best.values(), 1);
  const n = tracks.length;
  return tracks
    .map((t, i) => ({ t, score: 0.4 * (1 - i / n) + 0.6 * ((best.get(key(t.info.title, t.info.author)) ?? 0) / top) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}

/** Spotify songs for a query, deduplicated and re-ranked by popularity, within `deadlineMs`. Never throws. */
export async function spotifySongs(query: string, opts: { search?: Search; ranker?: Ranker; deadlineMs?: number } = {}): Promise<Track[]> {
  const { search = nodeSearch, ranker = deezerRanks, deadlineMs = suggestRules.deadlineMs } = opts;
  const [songs, ranks] = await Promise.all([within(query, 'spsearch', search, deadlineMs), ranksWithin(query, ranker, deadlineMs)]);
  return rerankByPopularity(dedupe(songs), ranks);
}

/** Autocomplete choices for what the user has typed so far. Never throws. */
export async function suggest(
  input: string,
  opts: { search?: Search; ranker?: Ranker; spotify?: boolean; deadlineMs?: number } = {},
): Promise<{ name: string; value: string }[]> {
  const { search = nodeSearch, ranker = deezerRanks, spotify = spotifyEnabled(), deadlineMs = suggestRules.deadlineMs } = opts;
  const q = input.trim();
  if (q.length < suggestRules.minChars || /^https?:\/\//i.test(q) || /^spotify:/i.test(q)) return [];
  const started = Date.now();
  let tracks: Track[] = [];
  if (spotify) tracks = (await spotifySongs(q, { search, ranker, deadlineMs })).slice(0, suggestRules.max);
  if (!tracks.length) {
    // No Spotify keys, or Spotify found nothing / failed in time: SoundCloud with whatever time is left
    const left = deadlineMs - (Date.now() - started);
    const sc = left > 200 ? await within(q, 'scsearch', search, left) : fallback(q, 'scsearch');
    tracks = rankSearch(q, sc).ranked.slice(0, suggestRules.max).map((r) => r.track);
  }
  return tracks.filter((t) => t.info.uri).map((t) => ({ name: choiceName(t), value: choiceValue(t.info.uri!) }));
}

/** Tests only. */
export function clearSuggestCache(): void {
  cache.clear();
  inflight.clear();
  rankCache.clear();
  rankInflight.clear();
  keys.clear();
}

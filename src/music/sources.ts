/**
 * What /play accepts. Plain text searches SoundCloud. Links from SoundCloud, Bandcamp and public
 * https audio files play directly. Spotify and Apple Music links are only read for their track info;
 * each song is then matched on SoundCloud (and skipped when no match is close enough).
 */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export const NO_YOUTUBE = "YouTube isn't supported. Try the song name, a SoundCloud or Bandcamp link, or upload an audio file.";
export const SEARCH_DOWN = 'Song search is temporarily unavailable. Try a Bandcamp link, a direct audio link, or upload a file.';
export const NO_SPOTIFY = "Spotify links aren't supported yet.";
export const NO_LIVE = "Live streams aren't supported. Try a song, a playlist or an audio file.";
export const SUPPORTED = 'Supported: song names (searched on SoundCloud), SoundCloud, Bandcamp, Spotify and Apple Music links, direct audio links and uploaded audio files.';

export const sourceRules = {
  /** Spotify/Apple playlists and albums: at most this many songs are matched. */
  maxMatchedTracks: 50,
  /** SoundCloud searches running at once while matching a playlist. */
  matchConcurrency: 5,
  /** Results looked at per song. */
  candidates: 8,
  /** Uploaded files and direct links: audio only, up to this size (Discord's own upload limit is lower for most). */
  audioExtensions: ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm', 'mka'],
} as const;

export type QueryKind = 'youtube' | 'mirror' | 'direct' | 'unsafe' | 'search';

const YOUTUBE = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|youtubekids\.com)$/i;
const MIRROR = /(^|\.)(open\.spotify\.com|spotify\.link|music\.apple\.com)$/i;

/** Which streaming service a mirror link is from. */
export function mirrorService(query: string): 'Spotify' | 'Apple Music' {
  return /apple/i.test(query) ? 'Apple Music' : 'Spotify';
}

/** Hostnames and IPs that must never be fetched on a user's behalf (Lavalink would reach them from our server). */
export function isPublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host) || host === 'localhost') return false;
  // Any literal IP address is refused: real audio hosts have names, and this rules out private ranges in every notation
  if (/^[\d.]+$/.test(host) || host.includes(':') || /^0x/i.test(host)) return false;
  return true;
}

/** Address ranges a link must never resolve to: private, loopback, link-local, CGNAT, multicast, reserved. */
const BLOCKED = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) BLOCKED.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) BLOCKED.addSubnet(net, bits, 'ipv6');

/** True for an IP address a user's link must not reach (IPv4-mapped IPv6 is checked as IPv4). */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  const family = isIP(address);
  if (!family) return true;
  return BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

type Resolver = (host: string) => Promise<{ address: string }[]>;
const dnsResolve: Resolver = (host) => lookup(host, { all: true, verbatim: true });

/**
 * Resolves a direct link's hostname and refuses it when any address is private, loopback or
 * link-local (so a public name pointing at our own network can't be used). Fails closed: a lookup
 * error or a lookup slower than `timeoutMs` counts as not public.
 */
export async function resolvesPublic(raw: string, resolve: Resolver = dnsResolve, timeoutMs = 2_000): Promise<boolean> {
  if (!isPublicHttpsUrl(raw)) return false;
  const host = new URL(raw).hostname;
  let timer: NodeJS.Timeout | undefined;
  try {
    const addresses = await Promise.race([
      resolve(host),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('dns timeout')), timeoutMs); }),
    ]);
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function classifyQuery(query: string): QueryKind {
  const q = query.trim();
  if (/^spotify:/i.test(q)) return 'mirror';
  if (!/^https?:\/\//i.test(q)) {
    // Bare links without a scheme, e.g. "youtu.be/abc"
    return /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(q) ? 'youtube' : 'search';
  }
  let host: string;
  try {
    host = new URL(q).hostname;
  } catch {
    return 'search';
  }
  if (YOUTUBE.test(host)) return 'youtube';
  if (MIRROR.test(host)) return 'mirror';
  return isPublicHttpsUrl(q) ? 'direct' : 'unsafe';
}

/** Whether an uploaded attachment looks like audio we can play. */
export function isAudioAttachment(a: { contentType?: string | null; name: string }): boolean {
  if (a.contentType?.startsWith('audio/')) return true;
  const ext = a.name.split('.').pop()?.toLowerCase() ?? '';
  return (sourceRules.audioExtensions as readonly string[]).includes(ext);
}

/* ── Matching a Spotify/Apple song to SoundCloud ─────────────────────────────────────────── */

export interface SongInfo {
  title: string;
  author: string;
  /** Milliseconds; 0 when unknown. */
  duration: number;
}

const NOISE = /\b(official|video|audio|lyrics?|lyric video|music video|hd|hq|4k|visualizer|explicit|clean|remaster(ed)?|\d{4} remaster|prod\.?|ft\.?|feat\.?|featuring)\b/g;

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' $1$2 ').replace(NOISE, ' ')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const words = (s: string) => new Set(normalize(s).split(' ').filter((w) => w.length > 1 || /\d/.test(w)));

/** Share of `a`'s words found in `b` (0–1). */
function covered(a: Set<string>, b: Set<string>): number {
  if (!a.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}

/** Remix, live, cover, sped-up, nightcore… versions only count when the original asked for one. */
const VERSION = /\b(remix|live|cover|sped up|slowed|nightcore|reverb|8d|karaoke|instrumental|acoustic|edit|mashup|bootleg|flip)\b/;

/**
 * How well a SoundCloud result matches the song (0–1), or 0 when it's clearly a different track:
 * the title must be mostly there, the artist named in the title or uploader, a different
 * version (remix, live, sped up…) only when asked for, and the length close (previews are rejected).
 */
export function matchScore(song: SongInfo, candidate: SongInfo): number {
  const title = words(song.title);
  const artist = words(song.author.split(/,|&| x | and /i)[0] ?? song.author);
  const hay = new Set([...words(candidate.title), ...words(candidate.author)]);
  const titleCover = covered(title, hay);
  if (titleCover < 0.75) return 0;
  const artistCover = covered(artist, hay);
  if (artistCover < 0.5) return 0;
  const wantVersion = VERSION.exec(normalize(song.title))?.[1];
  const hasVersion = VERSION.exec(normalize(candidate.title))?.[1];
  if (hasVersion && hasVersion !== wantVersion) return 0;
  if (song.duration > 0 && candidate.duration > 0) {
    const diff = Math.abs(song.duration - candidate.duration);
    if (diff > Math.max(10_000, song.duration * 0.1)) return 0;
    return 0.5 * titleCover + 0.3 * artistCover + 0.2 * (1 - diff / Math.max(10_000, song.duration * 0.1));
  }
  return 0.6 * titleCover + 0.4 * artistCover;
}

/** SoundCloud's 30-second previews of tracks it can't stream in full. */
const PREVIEW_MS = 30_000;

export interface Ranked<T> { track: T; score: number; artistMatch: boolean }

/**
 * Orders text-search results so the likely original comes first. Official major-label tracks are
 * often DRM-protected on SoundCloud, so the raw top hit is frequently an edit or re-upload.
 * - The "likely artist" is the query words that aren't in the title ("alone alan walker" on a
 *   track titled "Alone" → alan, walker). An uploader matching it is a strong boost.
 * - Titles close to the query rank higher; edits, remixes, sped-up versions and the like go down
 *   unless the query asks for them; 30-second previews go last.
 * - SoundCloud's own order breaks ties.
 * `originalLikelyMissing`: the query names an artist, but no uploader matches it.
 */
export function rankSearch<T extends { info: SongInfo }>(query: string, tracks: readonly T[]): { ranked: Ranked<T>[]; originalLikelyMissing: boolean } {
  const q = words(query);
  const wantVersion = VERSION.test(normalize(query));
  let namesArtist = false;
  const ranked = tracks.map((track, i): Ranked<T> => {
    const title = words(track.info.title);
    const uploader = words(track.info.author);
    const compactUploader = normalize(track.info.author).replace(/\s/g, '');
    const artist = new Set([...q].filter((w) => !title.has(w)));
    // Only a title that's mostly query words tells us the rest of the query is the artist
    if (artist.size && covered(title, q) >= 0.5) namesArtist = true;
    let hits = 0;
    for (const w of artist) if (uploader.has(w) || (w.length >= 4 && compactUploader.includes(w))) hits++;
    const artistMatch = artist.size > 0 && hits / artist.size >= 0.5;
    const version = !wantVersion && VERSION.test(normalize(track.info.title));
    const score = 0.4 * covered(q, new Set([...title, ...uploader]))
      + 0.3 * covered(title, q)
      + (artistMatch ? 0.5 : 0)
      - (version ? 0.6 : 0)
      - (track.info.duration === PREVIEW_MS ? 1 : 0)
      + 0.1 * (1 - i / Math.max(1, tracks.length));
    return { track, score, artistMatch };
  }).sort((a, b) => b.score - a.score);
  return { ranked, originalLikelyMissing: namesArtist && ranked.length > 0 && !ranked.some((r) => r.artistMatch) };
}

/** The best candidate, or null when none is a close enough match (never "something random"). */
export function bestMatch<T extends { info: SongInfo }>(song: SongInfo, candidates: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = matchScore(song, c.info);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

/** Runs `fn` over `items` with at most `limit` at once, keeping order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

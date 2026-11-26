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
  /** Lavaplayer's track identifier (SoundCloud: the stream URL it will play). */
  identifier?: string;
}

/**
 * SoundCloud serves some tracks (most official major-label uploads) only as a 30-second preview,
 * while still reporting the full length: they'd stop "midway". Lavaplayer's identifier then points
 * at a /preview/ stream instead of /stream/.
 */
export const isPreviewOnly = (t: { info: { identifier?: string } }) => /\/preview\//.test(t.info.identifier ?? '');

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
const VERSION = /\b(remix|remake|live|cover|sped up|slowed|nightcore|reverb|8d|karaoke|instrumental|acoustic|edit|mashup|bootleg|flip|hardstyle|techno|vip)\b/;

export const matchRules = {
  /** SoundCloud results fetched per song (scsearch[0,N]). */
  candidates: 20,
  /** Same recording: length within this of Spotify's. */
  toleranceMs: 3_000,
  /** Shorter results are previews or snippets (unless the song itself is that short). */
  minLengthMs: 60_000,
} as const;

/** exact: same title and artist, length within ±3 s. close: same title and artist, plausible length. loose: the best of the rest. */
export type MatchQuality = 'exact' | 'close' | 'loose';

/** The main artist: the first of "A, B & C" / "A x B" / "A feat. B". */
export const mainArtist = (author: string) => (author.split(/,|&| x | and | feat\.? | ft\.? /i)[0] ?? author).trim();

/** How much of the song's title and main artist a SoundCloud result names (0–1 each), and whether it's another version. */
function evidence(song: SongInfo, c: SongInfo) {
  const hay = new Set([...words(c.title), ...words(c.author)]);
  const compact = `${normalize(c.author)} ${normalize(c.title)}`.replace(/\s/g, '');
  const artist = words(mainArtist(song.author));
  let artistHits = 0;
  for (const w of artist) if (hay.has(w) || (w.length >= 4 && compact.includes(w))) artistHits++;
  const wantVersion = VERSION.exec(normalize(song.title))?.[1];
  const hasVersion = VERSION.exec(normalize(c.title))?.[1];
  // A medley or a "Song / Other Song / Third" upload names the title too: most of the upload's own
  // title (minus the artist) must be the song's title
  const songWords = new Set([...words(song.title), ...words(song.author)]);
  const own = new Set([...words(c.title)].filter((w) => !artist.has(w)));
  return {
    title: covered(words(song.title), hay),
    focus: own.size ? covered(own, songWords) : 0,
    artist: artist.size ? artistHits / artist.size : 0,
    version: !!hasVersion && hasVersion !== wantVersion,
  };
}

/** YouTube: a music video or lyric video plays intros and skits; official audio ("Topic" channels) is the song itself. */
const VIDEOISH = /official (music )?video|music video|\(video\)|\[video\]|lyric video|lyrics|visuali[sz]er|\bmv\b/i;
const isTopic = (author: string) => / - topic$/i.test(author);

/**
 * Finds a Spotify/Apple song on YouTube Music or SoundCloud, among uploads that play in full (no previews). The same
 * recording is the result whose length is within ±3 s and whose title and uploader name the title
 * and artist (closest length wins). Without one, the best-scoring result that still names the
 * artist in its title or uploader: title/artist match and length closeness count; other versions,
 * very short results and results over twice the length are pushed down. Null when nothing names
 * the artist (never a random song that happens to share the title).
 */
export function pickMatch<T extends { info: SongInfo }>(song: SongInfo, candidates: readonly T[]): { track: T; quality: MatchQuality } | null {
  const playable = candidates.filter((t) => !isPreviewOnly(t));
  if (!playable.length) return null;
  const n = playable.length;
  const scored = playable.map((track, i) => {
    const c = track.info;
    const e = evidence(song, c);
    const matches = e.title >= 0.75 && e.focus >= 0.5 && e.artist >= 0.5 && !e.version;
    const diff = song.duration > 0 && c.duration > 0 ? Math.abs(song.duration - c.duration) : Infinity;
    const tooShort = c.duration > 0 && c.duration < matchRules.minLengthMs && song.duration >= matchRules.minLengthMs + matchRules.toleranceMs;
    const tooLong = song.duration > 0 && c.duration > 2 * song.duration;
    const near = Number.isFinite(diff) ? Math.max(0, 1 - diff / Math.max(10_000, song.duration * 0.1)) : 0;
    const videoish = VIDEOISH.test(c.title);
    const score = 0.5 * e.title + 0.2 * e.focus + 0.3 * e.artist + 0.3 * near - (e.version ? 0.6 : 0) - (tooShort ? 1 : 0) - (tooLong ? 1 : 0)
      - (videoish ? 0.2 : 0) + (isTopic(c.author) ? 0.1 : 0) + 0.05 * (1 - i / n);
    return { track, i, diff, matches, videoish, namesArtist: e.artist >= 0.5, sameSong: e.title >= 0.75 && e.focus >= 0.5, plausible: !tooShort && !tooLong, score };
  });
  // Official audio before music videos, then the closest length
  const exact = scored.filter((s) => s.matches && s.diff <= matchRules.toleranceMs)
    .sort((a, b) => Number(a.videoish) - Number(b.videoish) || a.diff - b.diff || a.i - b.i)[0];
  if (exact) return { track: exact.track, quality: 'exact' };
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const close = byScore.find((s) => s.matches && s.plausible);
  if (close) return { track: close.track, quality: 'close' };
  // A version of this song (remix, cover…) before another song by the same artist
  const loose = byScore.find((s) => s.namesArtist && s.sameSong && s.plausible) ?? byScore.find((s) => s.namesArtist);
  return loose ? { track: loose.track, quality: 'loose' } : null;
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
export function rankSearch<T extends { info: SongInfo }>(query: string, all: readonly T[]): { ranked: Ranked<T>[]; originalLikelyMissing: boolean } {
  const tracks = all.filter((t) => !isPreviewOnly(t));
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

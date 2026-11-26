/**
 * What /play accepts. Plain text searches SoundCloud. Links from SoundCloud, Bandcamp and public
 * https audio files play directly. Spotify and Apple Music links are only read for their track info;
 * each song is then matched on SoundCloud (and skipped when no match is close enough).
 */

export const NO_YOUTUBE = "YouTube isn't supported. Try the song name, a SoundCloud link, or /radio.";
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

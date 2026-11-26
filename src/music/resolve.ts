import type { Track } from 'lavalink-client';
import { isPreviewOnly, mainArtist, matchRules, pickMatch, rankSearch, type MatchQuality, type SongInfo } from './sources';
import { noteYouTubeError, youtubeUsable } from './youtube';

/**
 * Turns a song (from Spotify/Apple, or typed text) into something playable: YouTube Music first
 * (ytmsearch), SoundCloud as the fallback when YouTube has no good match, fails or is blocked.
 * The search function is passed in, so /play (with the user as requester) and the playback-error
 * fallback (manager.ts) share this, and tests can feed recorded results.
 */

/** `source`: the source failed (logged by the searcher). `client`: Lavalink itself is unreachable. */
export type SearchFailure = 'source' | 'client' | null;
export type Searcher = (query: string, source: string) => Promise<{ tracks: Track[]; failure: SearchFailure; error?: string }>;

/** SoundCloud search with more results than the default 10 (lavaplayer's scsearch[offset,limit]). */
export const SC_MATCH = `scsearch[0,${matchRules.candidates}]`;
export const YTM = 'ytmsearch';

/** What a matched track remembers (Track.userData): the song it stands for, and the link players see. */
export interface MatchData { song: SongInfo; link?: string }

const playable = (tracks: Track[]) => tracks.filter((t) => !t.info.isStream && !isPreviewOnly(t));

function tag(track: Track, song: SongInfo, link?: string): Track {
  const match: MatchData = { song: { title: song.title, author: song.author, duration: song.duration }, ...(link ? { link } : {}) };
  track.userData = { ...(track.userData ?? {}), match: match as unknown as Record<string, string> };
  return track;
}

export const matchData = (t: Track): MatchData | undefined => (t.userData as { match?: MatchData } | undefined)?.match;

async function youtubeSearch(search: Searcher, query: string): Promise<Track[] | null> {
  if (!youtubeUsable()) return null;
  const res = await search(query, YTM);
  if (res.failure === 'source') {
    noteYouTubeError(res.error ?? 'search failed');
    return null;
  }
  return res.failure ? null : playable(res.tracks);
}

/**
 * A song on YouTube Music, else SoundCloud. Takes YouTube's exact or close match; otherwise
 * SoundCloud's best (any quality); otherwise YouTube's loose one. Null when nothing names the
 * artist; 'client' when Lavalink is unreachable. `link`: shown to players instead of a YouTube URL.
 */
export async function findSong(search: Searcher, song: SongInfo, link?: string, opts: { youtube?: boolean } = {}): Promise<{ track: Track; quality: MatchQuality } | null | 'client'> {
  const query = `${mainArtist(song.author)} ${song.title}`;
  const yt = opts.youtube === false ? null : await youtubeSearch(search, query);
  const ytPick = yt ? pickMatch(song, yt) : null;
  if (ytPick && ytPick.quality !== 'loose') return { track: tag(ytPick.track, song, link), quality: ytPick.quality };

  const sc = await search(query, SC_MATCH);
  if (sc.failure === 'client') return 'client';
  const scPick = sc.failure ? null : pickMatch(song, playable(sc.tracks));
  const pick = scPick ?? ytPick;
  return pick ? { track: tag(pick.track, song, link), quality: pick.quality } : null;
}

/** Typed text without Spotify: YouTube Music's best-ranked result, else SoundCloud's. 'client' / 'source' when both fail. */
export async function findText(search: Searcher, query: string): Promise<Track | null | 'client' | 'source'> {
  const yt = await youtubeSearch(search, query);
  const ytTop = yt ? rankSearch(query, yt).ranked[0]?.track : undefined;
  if (ytTop) return ytTop;
  const sc = await search(query, 'scsearch');
  if (sc.failure) return sc.failure;
  return rankSearch(query, playable(sc.tracks)).ranked[0]?.track ?? null;
}

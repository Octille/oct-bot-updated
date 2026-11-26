import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from 'lavalink-client';
import { pickMatch } from '../src/music/sources';
import { findSong, findText, matchData, SC_MATCH, YTM, type Searcher } from '../src/music/resolve';
import { noteYouTubeError, resetYouTube, youtubeRules, youtubeUsable } from '../src/music/youtube';
import { linkedTitle, trackLink } from '../src/music/panel';

import { logError } from '../src/lib/logger';

vi.mock('../src/lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logNotice: vi.fn() }));

type Info = { title: string; author: string; duration: number; identifier?: string; uri?: string; sourceName?: string };
const track = (info: Info) => ({ info: { isStream: false, uri: `https://example.com/${info.title}`, identifier: info.title, ...info } }) as unknown as Track;
const yt = (title: string, author: string, duration: number) => track({ title, author, duration, sourceName: 'youtube', uri: `https://music.youtube.com/watch?v=${title}` });
const sc = (title: string, author: string, duration: number) => track({ title, author, duration, sourceName: 'soundcloud', uri: `https://soundcloud.com/${author}/${title}`, identifier: `A:https://x/${title}/stream/hls` });

// Real YouTube Music results for each song's "artist title" (captured 2026-11-26)
const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'youtube-matches.json'), 'utf8')) as { query: string; spotify: Info; youtube: Info[] }[];

describe('YouTube Music matching', () => {
  it.each(fixtures.map((f) => f.query))('real search "%s": the original recording, within ±3 s of Spotify', (q) => {
    const f = fixtures.find((x) => x.query === q)!;
    const m = pickMatch(f.spotify, f.youtube.map(track))!;
    expect(m.quality).toBe('exact');
    expect(m.track.info.author).toBe(f.spotify.author.split(',')[0]);
    expect(Math.abs(m.track.info.duration - f.spotify.duration)).toBeLessThanOrEqual(3_000);
  });

  it('prefers official audio ("Topic") over the music video at the same length', () => {
    const song = { title: 'Closer', author: 'The Chainsmokers', duration: 244_000 };
    const video = yt('The Chainsmokers - Closer (Official Video) ft. Halsey', 'The Chainsmokers', 244_000);
    const audio = yt('Closer', 'The Chainsmokers - Topic', 246_000);
    expect(pickMatch(song, [video, audio])?.track).toBe(audio);
  });
});

describe('YouTube first, SoundCloud fallback', () => {
  beforeEach(() => {
    resetYouTube();
    vi.mocked(logError).mockClear();
  });
  const song = { title: 'Closer', author: 'The Chainsmokers, Halsey', duration: 244_000 };
  const ytCloser = yt('Closer (feat. Halsey)', 'The Chainsmokers', 246_000);
  const scCloser = sc('The Chainsmokers - Closer', 'reuploader', 245_000);
  const searcher = (results: Record<string, Awaited<ReturnType<Searcher>>>) => vi.fn<Searcher>(async (_q, source) => results[source] ?? { tracks: [], failure: null });

  it('plays YouTube Music when it has the song, and remembers the song and the link players see', async () => {
    const search = searcher({ [YTM]: { tracks: [ytCloser], failure: null }, [SC_MATCH]: { tracks: [scCloser], failure: null } });
    const m = await findSong(search, song, 'https://open.spotify.com/track/abc');
    expect(m).toMatchObject({ track: ytCloser, quality: 'exact' });
    expect(search.mock.calls.map((c) => c[1])).toEqual([YTM]);
    expect(matchData(ytCloser)).toEqual({ song: { title: 'Closer', author: 'The Chainsmokers, Halsey', duration: 244_000 }, link: 'https://open.spotify.com/track/abc' });
  });

  it('falls back to SoundCloud when YouTube is blocked, logs it once, and skips YouTube for a while', async () => {
    const blocked = { tracks: [], failure: 'source' as const, error: "Sign in to confirm you're not a bot" };
    const search = searcher({ [YTM]: blocked, [SC_MATCH]: { tracks: [scCloser], failure: null } });
    expect(await findSong(search, song)).toMatchObject({ track: scCloser, quality: 'exact' });
    expect(youtubeUsable()).toBe(false);
    expect(vi.mocked(logError).mock.calls[0]?.[0]).toBe('YouTube blocked');
    search.mockClear();
    await findSong(search, song);
    expect(search.mock.calls.map((c) => c[1])).toEqual([SC_MATCH]); // YouTube not even tried
    expect(youtubeUsable(Date.now() + youtubeRules.cooldownMs + 1)).toBe(true);
  });

  it('repeated playback failures switch YouTube off too; one failure does not', () => {
    expect(noteYouTubeError('This video cannot be loaded')).toBe(false);
    expect(noteYouTubeError('This video cannot be loaded')).toBe(false);
    expect(noteYouTubeError('This video cannot be loaded')).toBe(true);
    expect(youtubeUsable()).toBe(false);
  });

  it("YouTube's loose match loses to SoundCloud's; nothing naming the artist on either plays nothing", async () => {
    const ytLoose = yt('Closer (Remix)', 'The Chainsmokers', 200_000);
    expect(await findSong(searcher({ [YTM]: { tracks: [ytLoose], failure: null }, [SC_MATCH]: { tracks: [scCloser], failure: null } }), song))
      .toMatchObject({ track: scCloser });
    expect(await findSong(searcher({ [YTM]: { tracks: [yt('Closer', 'NE-YO', 234_000)], failure: null }, [SC_MATCH]: { tracks: [sc('Closer', 'Gehlee', 84_000)], failure: null } }), song)).toBeNull();
    expect(await findSong(searcher({ [YTM]: { tracks: [], failure: null }, [SC_MATCH]: { tracks: [], failure: 'client' } }), song)).toBe('client');
  });

  it('typed text without Spotify: YouTube Music first, SoundCloud when YouTube has nothing or fails', async () => {
    const ytAlone = yt('Alone', 'Alan Walker', 162_000);
    const scAlone = sc('Alone', 'alanwalker', 161_000);
    expect(await findText(searcher({ [YTM]: { tracks: [ytAlone], failure: null }, scsearch: { tracks: [scAlone], failure: null } }), 'alone alan walker')).toBe(ytAlone);
    expect(await findText(searcher({ [YTM]: { tracks: [], failure: 'source', error: 'HTTP 429' }, scsearch: { tracks: [scAlone], failure: null } }), 'alone alan walker')).toBe(scAlone);
  });
});

describe('players never see YouTube', () => {
  it('YouTube tracks link to the Spotify page they came from, or to nothing', () => {
    const t = yt('Closer', 'The Chainsmokers', 246_000);
    expect(trackLink(t)).toBeNull();
    expect(linkedTitle(t)).toBe('Closer');
    t.userData = { match: { song: { title: 'Closer', author: 'x', duration: 1 }, link: 'https://open.spotify.com/track/abc' } } as never;
    expect(linkedTitle(t)).toBe('[Closer](https://open.spotify.com/track/abc)');
    const s = sc('Alone', 'alanwalker', 161_000);
    expect(trackLink(s)).toBe('https://soundcloud.com/alanwalker/Alone');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NO_SPOTIFY, NO_YOUTUBE, SEARCH_DOWN, classifyQuery, isAudioAttachment, isPrivateAddress, isPublicHttpsUrl, mapLimit, isPreviewOnly, rankSearch, resolvesPublic, mainArtist, mirrorService, pickSoundCloud } from '../src/music/sources';
import { choiceName, choiceValue, clearSuggestCache, rerankByPopularity, resolveChoice, suggest } from '../src/music/suggest';
import type { Track } from 'lavalink-client';
import { getCommandList } from '../src/framework/commandList';
import '../src/framework/registry';

describe('what /play accepts', () => {
  it('YouTube links are refused in every form', () => {
    for (const q of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://music.youtube.com/watch?v=x', 'https://m.youtube.com/watch?v=x', 'youtu.be/abc', 'www.youtube.com/watch?v=1', 'https://www.youtube-nocookie.com/embed/x']) {
      expect(classifyQuery(q), q).toBe('youtube');
    }
    expect(NO_YOUTUBE).toBe("YouTube isn't supported. Try the song name, a SoundCloud or Bandcamp link, or upload an audio file.");
    expect(SEARCH_DOWN).toBe('Song search is temporarily unavailable. Try a Bandcamp link, a direct audio link, or upload a file.');
    expect(NO_SPOTIFY).toBe("Spotify links aren't supported yet.");
    expect(mirrorService('https://open.spotify.com/track/x')).toBe('Spotify');
    expect(mirrorService('https://music.apple.com/us/song/x/1')).toBe('Apple Music');
  });

  it('Spotify/Apple links are matched, others play directly, text is searched', () => {
    expect(classifyQuery('https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt')).toBe('mirror');
    expect(classifyQuery('spotify:track:1eyzqe2QqGZUmfcPZtrIyt')).toBe('mirror');
    expect(classifyQuery('https://music.apple.com/us/album/x/1?i=2')).toBe('mirror');
    expect(classifyQuery('https://soundcloud.com/a/b')).toBe('direct');
    expect(classifyQuery('https://c418.bandcamp.com/track/sweden')).toBe('direct');
    expect(classifyQuery('midnight city m83')).toBe('search');
  });

  it('never fetches private or odd addresses for someone', () => {
    for (const u of ['http://example.com/a.mp3', 'https://localhost/a.mp3', 'https://127.0.0.1/a.mp3', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://0x7f000001/x',
      'https://2130706433/x', 'https://lavalink.internal/x', 'https://printer.local/x', 'https://user:pw@example.com/x', 'https://example.com:2333/x', 'file:///etc/passwd', 'https://intranet/x']) {
      expect(isPublicHttpsUrl(u), u).toBe(false);
    }
    expect(classifyQuery('http://192.168.1.1/admin')).toBe('unsafe');
    expect(isPublicHttpsUrl('https://cdn.discordapp.com/attachments/1/2/song.mp3')).toBe(true);
  });

  it('audio uploads only', () => {
    expect(isAudioAttachment({ contentType: 'audio/mpeg', name: 'x.bin' })).toBe(true);
    expect(isAudioAttachment({ contentType: null, name: 'Song.FLAC' })).toBe(true);
    expect(isAudioAttachment({ contentType: 'image/png', name: 'x.png' })).toBe(false);
  });
});

describe('matching Spotify/Apple songs to SoundCloud', () => {
  const song = { title: 'Midnight City', author: 'M83', duration: 243_000 };
  const c = (title: string, author: string, duration: number) => ({ info: { title, author, duration } });

  it('takes the same recording (±3 s, title and artist) over remixes, covers and previews; closest length wins', () => {
    const right = c('M83 - Midnight City (Official Audio)', 'M83 Official', 244_000);
    const candidates = [c('Midnight City (Remix)', 'M83', 243_000), c('Midnight City', 'Some Cover Band', 243_000), c('M83 - Midnight City', 'fan', 30_000), c('Midnight City', 'M83', 246_000), right];
    expect(pickSoundCloud(song, candidates)).toEqual({ track: right, quality: 'exact' });
  });

  it('without the same recording: a plausible title-and-artist match, else the best of the rest', () => {
    const near = c('Midnight City', 'M83', 251_000);
    expect(pickSoundCloud(song, [c('Midnight City (Remix)', 'M83', 243_000), near])).toEqual({ track: near, quality: 'close' });
    // Over twice the length (a 1-hour loop) or under a minute: never "close"
    const loop = c('M83 - Midnight City 1 hour', 'loops', 3_600_000);
    const snippet = c('M83 - Midnight City', 'clips', 45_000);
    const cover = c('M83 - Midnight City (cover)', 'someone', 240_000);
    const otherSong = c('M83 - Wait', 'M83', 243_000);
    expect(pickSoundCloud(song, [otherSong, loop, snippet, cover])).toEqual({ track: cover, quality: 'loose' });
    expect(pickSoundCloud(song, [])).toBeNull();
  });

  it('never picks a 30-second preview (full length reported, /preview/ stream)', () => {
    const preview = { info: { title: 'Midnight City', author: 'M83', duration: 243_000, identifier: 'U:https://api-v2.soundcloud.com/media/soundcloud:tracks:1/x/preview/hls' } };
    const reupload = { info: { title: 'M83 - Midnight City', author: 'fan', duration: 244_000, identifier: 'A:https://api-v2.soundcloud.com/media/soundcloud:tracks:2/y/stream/hls' } };
    expect(isPreviewOnly(preview)).toBe(true);
    expect(isPreviewOnly(reupload)).toBe(false);
    expect(pickSoundCloud(song, [preview, reupload])).toEqual({ track: reupload, quality: 'exact' });
    expect(pickSoundCloud(song, [preview])).toBeNull();
    expect(rankSearch('midnight city m83', [preview, reupload]).ranked.map((r) => r.track)).toEqual([reupload]);
  });

  it("plays nothing when no upload names the artist (a different song that shares the title)", () => {
    const closer = { title: 'Closer', author: 'The Chainsmokers, Halsey', duration: 244_000 };
    expect(pickSoundCloud(closer, [c('Closer-Gehlee(male version-Gelmusic-Gelxie.mp3', 'Brtbrrt18', 84_000), c('Closer', 'NE-YO', 234_000)])).toBeNull();
  });

  it('a remix is fine when the remix was asked for; accents, featured artists and one-word uploaders are handled', () => {
    const remix = { title: 'Midnight City (Eric Prydz Remix)', author: 'M83, Eric Prydz', duration: 400_000 };
    expect(pickSoundCloud(remix, [c('M83 - Midnight City (Eric Prydz Remix)', 'Eric Prydz', 401_000)])?.quality).toBe('exact');
    expect(pickSoundCloud({ title: 'Café del Mar', author: 'Energy 52', duration: 400_000 }, [c('Cafe Del Mar (feat. nobody)', 'energy52music', 401_000)])?.quality).toBe('exact');
    expect(mainArtist('Alan Walker, Ava Max')).toBe('Alan Walker');
    expect(mainArtist('Calvin Harris feat. Rihanna')).toBe('Calvin Harris');
  });

  // Real Spotify top results and the 20 SoundCloud results for "<artist> <title>" (captured 2026-11-26)
  const fixtures = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'soundcloud-matches.json'), 'utf8')) as {
    query: string; spotify: { title: string; author: string; duration: number }; soundcloud: { title: string; author: string; duration: number; uri: string; identifier: string }[];
  }[];
  const run = (q: string) => {
    const f = fixtures.find((x) => x.query === q)!;
    return { f, m: pickSoundCloud(f.spotify, f.soundcloud.map((info) => ({ info })))! };
  };

  it('real searches: the official uploads are previews and are never picked', () => {
    for (const f of fixtures) {
      const { m } = run(f.query);
      expect(m.track.info.identifier, f.query).not.toMatch(/\/preview\//);
    }
    expect(fixtures.filter((f) => f.soundcloud.some((t) => /\/preview\//.test(t.identifier))).map((f) => f.query))
      .toEqual(expect.arrayContaining(['alone alan walker', 'bohemian rhapsody', 'believer imagine dragons', 'closer']));
  });

  it.each(['bohemian rhapsody', 'believer imagine dragons'])('real search "%s": a full re-upload of the same recording', (q) => {
    const { f, m } = run(q);
    expect(m.quality).toBe('exact');
    expect(m.track.info.title).toMatch(new RegExp(f.spotify.title, 'i'));
    expect(Math.abs(m.track.info.duration - f.spotify.duration)).toBeLessThanOrEqual(3_000);
  });

  it('real search "closer" (The Chainsmokers): an upload naming The Chainsmokers, not another "Closer"', () => {
    const { m } = run('closer');
    expect(`${m.track.info.title} ${m.track.info.author}`).toMatch(/chainsmokers/i);
    expect(m.quality).not.toBe('exact');
  });

  it('real search "alone alan walker": a version of Alone, not another Alan Walker song', () => {
    const { m } = run('alone alan walker');
    expect(m.track.info.title).toMatch(/alone/i);
    expect(m.track.info.title).not.toMatch(/better off|pt\.? ?ii/i);
  });

  it.each(['blinding lights', 'shape of you ed sheeran', 'faded alan walker', 'levitating dua lipa', 'someone you loved'])(
    'real search "%s" (original not on SoundCloud): says so, and never picks an edit/remix/cover when a plain upload exists, or a loop',
    (q) => {
      const { f, m } = run(q);
      expect(m.quality).not.toBe('exact');
      expect(m.track.info.duration).toBeLessThanOrEqual(2 * f.spotify.duration);
      if (m.quality === 'close') expect(m.track.info.title).not.toMatch(/remix|edit|cover|slowed|sped|nightcore|reverb|bootleg|mashup/i);
    },
  );

  it('mapLimit keeps order and limits concurrency', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('no YouTube anywhere users can see', () => {
  it('command names, descriptions and options never mention it (or the removed /radio)', () => {
    const text = JSON.stringify(getCommandList().map((c) => c.data.toJSON()));
    expect(text).not.toMatch(/youtube/i);
    expect(text).not.toMatch(/radio/i);
  });
});

describe('direct links resolve to public addresses only', () => {
  const at = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));

  it('flags private, loopback, link-local and mapped addresses', () => {
    for (const a of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.5', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', 'nonsense']) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ['1.1.1.1', '151.101.1.69', '2606:4700::1111']) expect(isPrivateAddress(a), a).toBe(false);
  });

  it('refuses a public-looking name that resolves to a private address, and fails closed', async () => {
    expect(await resolvesPublic('https://cdn.example.com/a.mp3', at('93.184.216.34'))).toBe(true);
    expect(await resolvesPublic('https://evil.example.com/a.mp3', at('93.184.216.34', '169.254.169.254'))).toBe(false);
    expect(await resolvesPublic('https://evil.example.com/a.mp3', at('::ffff:10.0.0.1'))).toBe(false);
    expect(await resolvesPublic('https://none.example.com/a.mp3', at())).toBe(false);
    expect(await resolvesPublic('https://err.example.com/a.mp3', async () => { throw new Error('ENOTFOUND'); })).toBe(false);
    expect(await resolvesPublic('https://slow.example.com/a.mp3', () => new Promise(() => {}), 20)).toBe(false);
  });
});

describe('ranking text-search results', () => {
  const t = (title: string, author: string, duration = 200_000) => ({ info: { title, author, duration } });

  it('puts the likely original first and pushes edits down', () => {
    const results = [
      t('Alone (sped up)', 'speedy edits'),
      t('Alone - Alan Walker (Remix)', 'dj someone'),
      t('Alone', 'Alan Walker'),
      t('Alone', 'random uploader'),
    ];
    const { ranked, originalLikelyMissing } = rankSearch('alone alan walker', results);
    expect(ranked[0]!.track.info.author).toBe('Alan Walker');
    expect(ranked.slice(-2).map((r) => r.track.info.title)).toEqual(expect.arrayContaining(['Alone (sped up)', 'Alone - Alan Walker (Remix)']));
    expect(originalLikelyMissing).toBe(false);
  });

  it('matches uploader names written as one word', () => {
    const { ranked } = rankSearch('faded alan walker', [t('Faded', 'some guy'), t('Faded', 'alanwalkermusic')]);
    expect(ranked[0]!.track.info.author).toBe('alanwalkermusic');
  });

  it('keeps versions the query asks for', () => {
    const { ranked } = rankSearch('alone nightcore', [t('Alone', 'Alan Walker'), t('Alone (Nightcore)', 'nc fan')]);
    expect(ranked[0]!.track.info.title).toBe('Alone (Nightcore)');
  });

  it('flags when no uploader matches the artist, and not for title-only searches', () => {
    expect(rankSearch('alone alan walker', [t('Alone (edit)', 'x'), t('Alone', 'y')]).originalLikelyMissing).toBe(true);
    expect(rankSearch('alone', [t('Alone', 'y'), t('Faded', 'z')]).originalLikelyMissing).toBe(false);
  });

  it('puts 30-second previews last', () => {
    const { ranked } = rankSearch('alone alan walker', [t('Alone', 'Alan Walker', 30_000), t('Alone', 'fan')]);
    expect(ranked[0]!.track.info.author).toBe('fan');
  });
});

describe('/play autocomplete', () => {
  const track = (title: string, author: string, uri = `https://soundcloud.com/${author.replace(/\s/g, '')}/${title.replace(/\s/g, '-')}`, duration = 225_000) =>
    ({ info: { title, author, uri, duration, isStream: false } }) as unknown as Track;
  beforeEach(() => clearSuggestCache());

  it('without Spotify keys: SoundCloud, "Title - Uploader [m:ss]" ranked, with the URL as the value', async () => {
    const search = vi.fn(async () => [track('Alone (sped up)', 'edits'), track('Alone', 'Alan Walker')]);
    const out = await suggest('alone alan walker', { search, spotify: false });
    expect(out[0]).toEqual({ name: 'Alone - Alan Walker [3:45]', value: 'https://soundcloud.com/AlanWalker/Alone' });
    expect(out).toHaveLength(2);
  });

  it('skips short input and links, and searches a repeated query once', async () => {
    const search = vi.fn(async () => [track('Alone', 'Alan Walker')]);
    const opts = { search, spotify: false };
    expect(await suggest('a', opts)).toEqual([]);
    expect(await suggest('https://soundcloud.com/x/y', opts)).toEqual([]);
    await Promise.all([suggest('alone', opts), suggest('Alone ', opts), suggest('alone', opts)]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('answers a slow search with the cached prefix (or nothing) instead of failing', async () => {
    await suggest('alone', { search: async () => [track('Alone', 'Alan Walker')], spotify: false });
    const slow = () => new Promise<Track[]>(() => {});
    expect((await suggest('alone ala', { search: slow, spotify: false, deadlineMs: 20 }))[0]?.name).toMatch(/^Alone - Alan Walker/);
    expect(await suggest('faded', { search: slow, spotify: false, deadlineMs: 20 })).toEqual([]);
    expect(await suggest('error', { search: async () => { throw new Error('down'); }, spotify: false, deadlineMs: 20 })).toEqual([]);
  });

  it("with Spotify keys: Spotify's own order, duplicates dropped, Spotify links as values", async () => {
    const sp = (title: string, author: string, id: string, duration = 161_000) => track(title, author, `https://open.spotify.com/track/${id}`, duration);
    const search = vi.fn(async (_q: string, source: string) => source === 'spsearch'
      ? [sp('Alone', 'Alan Walker', 'a1'), sp('Alone', 'Alan Walker', 'a2'), sp('Alone, Pt. II', 'Alan Walker, Ava Max', 'b', 179_000)]
      : [track('Alone', 'Alan Walker')]);
    const out = await suggest('alone alan walker', { search, ranker: async () => [], spotify: true });
    expect(out).toEqual([
      { name: 'Alone - Alan Walker [2:41]', value: 'https://open.spotify.com/track/a1' },
      { name: 'Alone, Pt. II - Alan Walker, Ava Max [2:59]', value: 'https://open.spotify.com/track/b' },
    ]);
    expect(search.mock.calls.map((c) => c[1])).toEqual(['spsearch']);
  });

  it('with Spotify keys but Spotify failing or empty: falls back to SoundCloud', async () => {
    const search = vi.fn(async (_q: string, source: string) => {
      if (source === 'spsearch') throw new Error('spotify down');
      return [track('Alone', 'Alan Walker')];
    });
    expect((await suggest('alone', { search, ranker: async () => [], spotify: true }))[0]?.value).toBe('https://soundcloud.com/AlanWalker/Alone');
  });

  // Real Spotify results (market CA) and Deezer ranks, captured 2026-11-26
  const popularity = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'spotify-popularity.json'), 'utf8')) as Record<string, {
    spotify: { title: string; author: string; duration: number; uri: string }[]; deezer: { title: string; artist: string; rank: number }[];
  }>;
  const fromFixture = (q: string) => ({
    search: async () => popularity[q]!.spotify.map((info) => ({ info: { ...info, isStream: false } }) as unknown as Track),
    ranker: async () => popularity[q]!.deezer,
    spotify: true,
  });

  it('real search "closer": The Chainsmokers is the top suggestion (popularity), though Spotify lists GEHLEE first', async () => {
    expect(popularity.closer!.spotify[0]!.author).toBe('GEHLEE');
    const out = await suggest('closer', fromFixture('closer'));
    expect(out[0]!.name).toMatch(/^Closer - The Chainsmokers/);
  });

  it.each([['blinding', /^Blinding Lights - The Weeknd/], ['alone alan walker', /^Alone - Alan Walker/]])(
    'real search "%s": the obvious song stays on top',
    async (q, top) => {
      expect((await suggest(q, fromFixture(q)))[0]!.name).toMatch(top);
    },
  );

  it("popularity only reorders: unknown to Deezer keeps Spotify's relative order; no data keeps Spotify's order; slow Deezer is skipped", async () => {
    const t = (title: string, author: string) => ({ info: { title, author, duration: 200_000 } }) as unknown as Track;
    const songs = [t('A', 'x'), t('B', 'y'), t('C', 'z')];
    expect(rerankByPopularity(songs, [])).toEqual(songs);
    expect(rerankByPopularity(songs, [{ title: 'C', artist: 'z', rank: 900_000 }]).map((s) => s.info.title)).toEqual(['C', 'A', 'B']);
    const slow = await suggest('abc', { ...fromFixture('closer'), ranker: () => new Promise(() => {}), deadlineMs: 30 });
    expect(slow[0]!.name).toMatch(/^Closer - GEHLEE/);
  });

  it('long URLs become short keys that resolve back, and expire', () => {
    const long = `https://soundcloud.com/${'x'.repeat(120)}`;
    const key = choiceValue(long, 0);
    expect(key.length).toBeLessThanOrEqual(100);
    expect(resolveChoice(key, 1_000)).toBe(long);
    expect(resolveChoice(key, 11 * 60_000)).toBeNull();
    expect(resolveChoice('alone alan walker')).toBeUndefined();
  });

  it('shortens long titles to fit 100 characters', () => {
    const name = choiceName(track('T'.repeat(150), 'Uploader'));
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith(' - Uploader [3:45]')).toBe(true);
  });
});

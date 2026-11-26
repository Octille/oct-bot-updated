import { describe, expect, it } from 'vitest';
import { NO_SPOTIFY, NO_YOUTUBE, SEARCH_DOWN, bestMatch, classifyQuery, isAudioAttachment, isPrivateAddress, isPublicHttpsUrl, mapLimit, rankSearch, resolvesPublic, matchScore, mirrorService } from '../src/music/sources';
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

  it('picks the right upload and skips wrong ones', () => {
    const right = c('M83 - Midnight City (Official Audio)', 'M83 Official', 244_000);
    const candidates = [c('Midnight City (Remix)', 'M83', 243_000), c('Midnight City', 'Some Cover Band', 243_000), c('M83 - Midnight City', 'fan', 30_000), right];
    expect(bestMatch(song, candidates)).toBe(right);
  });

  it('returns nothing rather than something random', () => {
    expect(bestMatch(song, [c('Midnight Train', 'M83', 243_000), c('City Lights', 'Someone', 243_000), c('Midnight City', 'M83', 120_000)])).toBeNull();
    expect(bestMatch(song, [])).toBeNull();
  });

  it('a remix is fine when the remix was asked for; accents and featured artists are ignored', () => {
    const remix = { title: 'Midnight City (Eric Prydz Remix)', author: 'M83, Eric Prydz', duration: 400_000 };
    expect(matchScore(remix, { title: 'M83 - Midnight City (Eric Prydz Remix)', author: 'Eric Prydz', duration: 401_000 })).toBeGreaterThan(0.6);
    expect(matchScore({ title: 'Café del Mar', author: 'Energy 52', duration: 0 }, { title: 'Energy 52 - Cafe Del Mar (feat. nobody)', author: 'x', duration: 0 })).toBeGreaterThan(0.6);
  });

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

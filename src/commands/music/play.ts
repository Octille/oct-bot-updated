import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildMember, type User } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import { defineCommand } from '../../framework/types';
import { musicRules } from '../../content/music';
import { embed } from '../../lib/embeds';
import { resolveChoice, suggest } from '../../music/suggest';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { escapeTitle, formatTime, linkedTitle } from '../../music/panel';
import { lavalink, nodeReady, voiceCheck } from '../../music/manager';
import { env } from '../../config/env';
import { logError } from '../../lib/logger';
import { NO_LIVE, NO_SPOTIFY, NO_YOUTUBE, SEARCH_DOWN, SUPPORTED, classifyQuery, isAudioAttachment, isPreviewOnly, mapLimit, mirrorService, resolvesPublic, sourceRules, type MatchQuality } from '../../music/sources';
import { spotifyEnabled, spotifySongs } from '../../music/suggest';
import { findSong, findText, YTM, type Searcher } from '../../music/resolve';

/** `note`: shown under the reply (e.g. the original wasn't found). */
type Found = { tracks: Track[]; name?: string; skipped?: number; total?: number; note?: string };

const NOT_ORIGINAL = "Couldn't find the original; playing the closest version.";
const unavailable = (song: Track) => `**${escapeTitle(song.info.title)}** by ${escapeTitle(song.info.author)} isn't available here. Try another version from the suggestions.`;

const MUSIC_DOWN = 'Music is unavailable right now. Try again in a minute.';

/**
 * `source`: Lavalink answered, but the music source itself failed (e.g. SoundCloud broke).
 * `client`: we couldn't talk to Lavalink at all (not connected, wrong password, timeout).
 * Either way the real error is logged.
 */
type Failure = 'source' | 'client' | null;

async function search(player: Player, query: string, user: User, source?: string): Promise<{ tracks: Track[]; playlist?: string; failure: Failure; previews?: number; error?: string }> {
  const what = source ? `${source}:${query}` : query;
  // YouTube switched off in Lavalink (YOUTUBE_ENABLED=false): nothing to search, not an error
  if (source === YTM && !player.node.info?.sourceManagers?.includes('youtube')) return { tracks: [], failure: null };
  try {
    // lavalink-client passes an unknown source (scsearch[0,20]) through to Lavalink as the prefix
    const res = await player.search(source ? { query, source: source as 'scsearch' } : { query }, user);
    if (res.loadType === 'error') {
      const ex = (res as { exception?: { message?: string | null; cause?: string; severity?: string } | null }).exception;
      const error = `${ex?.message ?? 'unknown'}${ex?.cause ? ` (${ex.cause.split('\n')[0]})` : ''}`;
      logError('music search', new Error(`Lavalink couldn't load "${what.slice(0, 120)}": ${error}`));
      return { tracks: [], failure: 'source', error };
    }
    if (res.loadType === 'empty') return { tracks: [], failure: null };
    // SoundCloud previews report the full length but stop after 30 seconds: never queue them
    const all = res.tracks as Track[];
    const tracks = all.filter((t) => !isPreviewOnly(t));
    return { tracks, playlist: res.loadType === 'playlist' ? res.playlist?.name ?? undefined : undefined, failure: null, previews: all.length - tracks.length };
  } catch (err) {
    logError(`music search "${what.slice(0, 120)}"`, err);
    return { tracks: [], failure: 'client' };
  }
}

/** /play's searches, with the user as requester (resolve.ts). */
const searcher = (player: Player, user: User): Searcher => (query, source) => search(player, query, user, source);

/** The link players see for a Spotify song: the Spotify page (never a YouTube URL). */
const spotifyLink = (song: Track) => (song.info.sourceName === 'spotify' || /open\.spotify\.com/.test(song.info.uri ?? '') ? song.info.uri ?? undefined : undefined);

/**
 * Plain text submitted without picking a suggestion. With Spotify keys: the top suggestion, found on
 * YouTube Music or SoundCloud. Without (or if Spotify search fails): YouTube Music's top result, else SoundCloud's.
 */
async function topResult(player: Player, query: string, user: User): Promise<Found> {
  if (spotifyEnabled()) {
    // The same order as the suggestions: Spotify re-ranked by popularity
    const song = (await spotifySongs(query, { deadlineMs: 6_000 }))[0];
    if (song) {
      const m = await findSong(searcher(player, user), song.info, spotifyLink(song));
      if (m === 'client') throw new UserError(MUSIC_DOWN);
      // Nothing names the artist: say so rather than play a random song with the same title
      if (m === null) throw new UserError(unavailable(song));
      return { tracks: [m.track], note: m.quality === 'exact' ? undefined : NOT_ORIGINAL };
    }
  }
  const top = await findText(searcher(player, user), query);
  if (top === 'client') throw new UserError(MUSIC_DOWN);
  if (top === 'source') throw new UserError(SEARCH_DOWN);
  if (!top) throw new UserError(`Nothing found for **${escapeTitle(query.slice(0, 80))}**.`);
  return { tracks: [top] };
}

/**
 * Connects if needed, queues the tracks and starts playing. Returns the reply, or null when a single
 * song starts right away with nothing to add (the now-playing panel says it all).
 */
async function enqueue(player: Player, found: Found) {
  const room = musicRules.maxQueue - player.queue.tracks.length;
  if (room <= 0) throw new UserError(`The queue is full (${musicRules.maxQueue} tracks).`);
  if (!player.connected) await player.connect();
  // Nothing playing yet: this starts right away and the panel says so
  const startsNow = !player.queue.current;
  const toAdd = found.tracks.slice(0, room);
  await player.queue.add(toAdd);
  if (!player.playing && !player.paused) await player.play();

  const first = toAdd[0]!;
  const notes = [
    found.note ?? null,
    found.skipped ? `${found.skipped} song${found.skipped === 1 ? '' : 's'} had no good SoundCloud match and ${found.skipped === 1 ? 'was' : 'were'} skipped.` : null,
    found.total && found.total > sourceRules.maxMatchedTracks ? `Only the first ${sourceRules.maxMatchedTracks} songs are matched.` : null,
    toAdd.length < found.tracks.length ? `The queue holds ${musicRules.maxQueue}.` : null,
  ].filter(Boolean);
  if (startsNow && toAdd.length === 1 && !notes.length) return null;
  const text = toAdd.length > 1
    ? `${icon('success')} Added **${toAdd.length}** tracks${found.name ? ` from **${escapeTitle(found.name)}**` : ''}.`
    : startsNow ? `${icon('success')} Playing **${escapeTitle(first.info.title)}**.`
      : `${icon('success')} Queued **${linkedTitle(first)}** · ${formatTime(first.info.duration ?? 0)} · #${player.queue.tracks.length} in the queue.`;
  return embed('music').setTitle(`${titleIcon('music')} Play`).setDescription([text, ...notes.map((n) => `-# ${n}`)].join('\n'));
}

/**
 * Spotify / Apple Music: read the songs, then find each one on YouTube Music or SoundCloud. A single song (a link or a
 * picked suggestion) plays the closest version when the original isn't there, with a note; in a
 * playlist, songs without a title-and-artist match are skipped.
 */
async function fromMirror(player: Player, url: string, user: User): Promise<Found> {
  const service = mirrorService(url);
  const res = await search(player, url, user);
  if (res.failure === 'client') throw new UserError(MUSIC_DOWN);
  if (!res.tracks.length) throw new UserError(`Couldn't read that ${service} link. Check that it's a song, album or public playlist.`);
  const songs = res.tracks.slice(0, sourceRules.maxMatchedTracks);
  const single = songs.length === 1 && !res.playlist;
  const results = await mapLimit(songs, sourceRules.matchConcurrency, (song) => findSong(searcher(player, user), song.info, spotifyLink(song)));
  if (results.every((r) => r === 'client')) throw new UserError(MUSIC_DOWN);
  const matches = results.filter((r): r is { track: Track; quality: MatchQuality } => !!r && typeof r === 'object' && (single || r.quality !== 'loose'));
  if (!matches.length) {
    throw new UserError(single ? unavailable(songs[0]!) : `Couldn't find good SoundCloud matches for the songs in that ${service} link.`);
  }
  const note = single && matches[0]!.quality !== 'exact' ? NOT_ORIGINAL : undefined;
  return { tracks: matches.map((m) => m.track), name: res.playlist, skipped: songs.length - matches.length, total: res.tracks.length, note };
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('play').setDescription('Play a song, playlist or audio file in your voice channel')
    .addStringOption((o) => o.setName('query').setDescription('Song name, or a SoundCloud, Bandcamp, Spotify or Apple Music link').setMaxLength(300).setAutocomplete(true))
    .addAttachmentOption((o) => o.setName('file').setDescription('An audio file to play (mp3, ogg, wav, flac, m4a…)')),
  category: 'music',
  guildOnly: true,
  async autocomplete(interaction) {
    await interaction.respond(await suggest(interaction.options.getFocused())).catch(() => undefined);
  },
  // Not deferred up front, and all replies are private: the now-playing panel is the public message
  async execute({ interaction }) {
    let query = interaction.options.getString('query')?.trim() ?? '';
    // A suggestion whose URL was too long for Discord arrives as a short key
    const picked = resolveChoice(query);
    if (picked === null) throw new UserError('That suggestion expired. Type the song again and pick it from the list.');
    if (picked) query = picked;
    const file = interaction.options.getAttachment('file');
    if (!query && !file) throw new UserError(`Give a song name or link, or upload an audio file. ${SUPPORTED}`);
    const kind = file ? 'file' : classifyQuery(query);
    if (kind === 'youtube') throw new UserError(NO_YOUTUBE);
    if (kind === 'mirror' && mirrorService(query) === 'Spotify' && !(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET)) throw new UserError(NO_SPOTIFY);
    if (kind === 'unsafe' || (kind === 'direct' && !(await resolvesPublic(query)))) throw new UserError(`That link can't be played. Links must be public https addresses. ${SUPPORTED}`);
    if (file && !isAudioAttachment(file)) throw new UserError('That file isn\'t audio. Upload an mp3, ogg, wav, flac or m4a file.');

    const manager = lavalink();
    if (!manager || !nodeReady()) throw new UserError(MUSIC_DOWN);
    const member = interaction.member as GuildMember;
    const problem = voiceCheck(member, manager.getPlayer(interaction.guildId!));
    if (problem) throw new UserError(problem);
    const channel = member.voice.channel!;
    const me = interaction.guild!.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) throw new UserError(`I need permission to connect and speak in <#${channel.id}>.`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const player = manager.getPlayer(interaction.guildId!) ?? manager.createPlayer({
      guildId: interaction.guildId!, voiceChannelId: channel.id, textChannelId: interaction.channelId, selfDeaf: true, volume: musicRules.defaultVolume,
    });
    const dropIfIdle = () => (!player.queue.current && !player.queue.tracks.length ? player.destroy('nothing to play').catch(() => undefined) : undefined);

    let found: Found;
    try {
      if (file) {
        const res = await search(player, file.url, interaction.user);
        if (res.failure === 'client') throw new UserError(MUSIC_DOWN);
        if (!res.tracks[0]) throw new UserError("Couldn't play that file. Make sure it's a normal audio file.");
        const t = res.tracks[0];
        // Files often have no title tag: show the file name instead
        if (!t.info.title || t.info.title === 'Unknown title') t.info.title = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
        found = { tracks: [t] };
      } else if (kind === 'mirror') {
        found = await fromMirror(player, query, interaction.user);
      } else if (kind === 'search') {
        found = await topResult(player, query, interaction.user);
      } else {
        const res = await search(player, query, interaction.user);
        if (res.failure === 'client') throw new UserError(MUSIC_DOWN);
        if (!res.tracks.length && res.previews) throw new UserError(`SoundCloud only allows a 30-second preview of that track, so it can't be played here. Try searching the song name for another version.`);
        if (!res.tracks.length) throw new UserError(`Couldn't play that link. ${SUPPORTED}`);
        found = { tracks: res.playlist ? res.tracks : [res.tracks[0]!], name: res.playlist };
        if (found.tracks.every((t) => t.info.isStream)) throw new UserError(NO_LIVE);
        found.tracks = found.tracks.filter((t) => !t.info.isStream);
      }
    } catch (err) {
      await dropIfIdle();
      throw err;
    }

    const result = await enqueue(player, found).catch(async (err: unknown) => {
      await dropIfIdle();
      throw err;
    });
    if (!result) return interaction.deleteReply();
    return interaction.editReply({ embeds: [result] });
  },
});

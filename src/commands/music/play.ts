import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, type User } from 'discord.js';
import type { Player, Track } from 'lavalink-client';
import { defineCommand } from '../../framework/types';
import { musicRules } from '../../content/music';
import { embed, errorEmbed } from '../../lib/embeds';
import { collect } from '../../lib/collect';
import { makeId } from '../../lib/customId';
import { btn, MAIN, row, select } from '../../ui/kit';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { escapeTitle, formatTime } from '../../music/panel';
import { lavalink, nodeReady, voiceCheck } from '../../music/manager';
import { env } from '../../config/env';
import { logError } from '../../lib/logger';
import { NO_LIVE, NO_SPOTIFY, NO_YOUTUBE, SEARCH_DOWN, SUPPORTED, bestMatch, classifyQuery, isAudioAttachment, mapLimit, mirrorService, PICKER_SIZE, rankSearch, resolvesPublic, sourceRules } from '../../music/sources';

/** `confirm`: always reply (a picked song), even when it starts right away. */
type Found = { tracks: Track[]; name?: string; skipped?: number; total?: number; confirm?: boolean };

const MUSIC_DOWN = 'Music is unavailable right now. Try again in a minute.';

/**
 * `source`: Lavalink answered, but the music source itself failed (e.g. SoundCloud broke).
 * `client`: we couldn't talk to Lavalink at all (not connected, wrong password, timeout).
 * Either way the real error is logged.
 */
type Failure = 'source' | 'client' | null;

async function search(player: Player, query: string, user: User, source?: 'scsearch'): Promise<{ tracks: Track[]; playlist?: string; failure: Failure }> {
  const what = source ? `${source}:${query}` : query;
  try {
    const res = await player.search(source ? { query, source } : { query }, user);
    if (res.loadType === 'error') {
      const ex = (res as { exception?: { message?: string | null; cause?: string; severity?: string } | null }).exception;
      logError('music search', new Error(`Lavalink couldn't load "${what.slice(0, 120)}": ${ex?.message ?? 'unknown'}${ex?.cause ? ` (${ex.cause.split('\n')[0]})` : ''}`));
      return { tracks: [], failure: 'source' };
    }
    if (res.loadType === 'empty') return { tracks: [], failure: null };
    return { tracks: res.tracks as Track[], playlist: res.loadType === 'playlist' ? res.playlist?.name ?? undefined : undefined, failure: null };
  } catch (err) {
    logError(`music search "${what.slice(0, 120)}"`, err);
    return { tracks: [], failure: 'client' };
  }
}

/** Plain text: SoundCloud results, best guess at the original first (see rankSearch). */
async function searchResults(player: Player, query: string, user: User): Promise<Track[]> {
  const res = await search(player, query, user, 'scsearch');
  if (res.failure === 'client') throw new UserError(MUSIC_DOWN);
  if (res.failure === 'source') throw new UserError(SEARCH_DOWN);
  const tracks = res.tracks.filter((t) => !t.info.isStream);
  if (!tracks.length) throw new UserError(`Nothing found on SoundCloud for **${escapeTitle(query.slice(0, 80))}**.`);
  return tracks;
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
    found.skipped ? `${found.skipped} song${found.skipped === 1 ? '' : 's'} had no good SoundCloud match and ${found.skipped === 1 ? 'was' : 'were'} skipped.` : null,
    found.total && found.total > sourceRules.maxMatchedTracks ? `Only the first ${sourceRules.maxMatchedTracks} songs are matched.` : null,
    toAdd.length < found.tracks.length ? `The queue holds ${musicRules.maxQueue}.` : null,
  ].filter(Boolean);
  if (startsNow && toAdd.length === 1 && !notes.length && !found.confirm) return null;
  const text = toAdd.length > 1
    ? `${icon('success')} Added **${toAdd.length}** tracks${found.name ? ` from **${escapeTitle(found.name)}**` : ''}.`
    : startsNow ? `${icon('success')} Playing **${escapeTitle(first.info.title)}**.`
      : `${icon('success')} Queued **[${escapeTitle(first.info.title)}](${first.info.uri})** · ${formatTime(first.info.duration ?? 0)} · #${player.queue.tracks.length} in the queue.`;
  return embed('music').setTitle(`${titleIcon('music')} Play`).setDescription([text, ...notes.map((n) => `-# ${n}`)].join('\n'));
}

const PICK_TIMEOUT = 60_000;

/** The private picker for text searches: the top results in a select menu, plus "Play top result". */
async function showPicker(interaction: ChatInputCommandInteraction, player: Player, query: string, results: Track[], dropIfIdle: () => unknown) {
  const { ranked, originalLikelyMissing } = rankSearch(query, results);
  const top = ranked.slice(0, PICKER_SIZE).map((r) => r.track);
  const owner = interaction.user.id;
  const line = (t: Track) => `${escapeTitle(t.info.author)} · ${t.info.duration ? formatTime(t.info.duration) : 'unknown length'}`;
  const message = await interaction.editReply({
    embeds: [embed('music').setTitle(`${titleIcon('music')} Pick a song`).setDescription([
      ...top.map((t, i) => `**${i + 1}.** ${escapeTitle(t.info.title)}\n-# ${line(t)}`),
      ...(originalLikelyMissing ? ['', `${icon('info')} The original may not be available here. These are the closest versions.`] : []),
    ].join('\n'))],
    components: [
      select(makeId('~play', owner), 'Choose a song', top.map((t, i) => ({ label: `${i + 1}. ${t.info.title}`, value: String(i), description: `${t.info.author} · ${t.info.duration ? formatTime(t.info.duration) : '?'}` }))),
      row(btn(makeId('~play', owner, 'top'), 'Play top result', MAIN)),
    ],
  });

  let picked = false;
  const collector = collect(message, { time: PICK_TIMEOUT, max: 1, disableOnEnd: false });
  collector.on('collect', (i) => {
    picked = true;
    void (async () => {
      try {
        const track = top[i.isStringSelectMenu() ? Number(i.values[0]) : 0];
        if (!track) throw new UserError('That song is no longer in the list. Run /play again.');
        const member = await interaction.guild!.members.fetch(owner);
        const live = lavalink()?.getPlayer(interaction.guildId!);
        if (!live || live !== player) throw new UserError('The music was stopped meanwhile. Run /play again.');
        const problem = voiceCheck(member, player);
        if (problem) throw new UserError(problem);
        const result = await enqueue(player, { tracks: [track], confirm: true });
        await i.update({ embeds: [result!], components: [] });
      } catch (err) {
        await dropIfIdle();
        const text = err instanceof UserError ? err.message : 'Something went wrong playing that. Try again.';
        if (!(err instanceof UserError)) logError('play picker', err);
        await i.update({ embeds: [errorEmbed(text)], components: [] }).catch(() => undefined);
      }
    })();
  });
  collector.on('end', () => {
    if (picked) return;
    void dropIfIdle();
    void interaction.editReply({ embeds: [embed('music').setDescription(`${icon('info')} No song picked. Run /play again when you're ready.`)], components: [] }).catch(() => undefined);
  });
}

/** Spotify / Apple Music: read the songs, then find each one on SoundCloud (only close matches). */
async function fromMirror(player: Player, url: string, user: User): Promise<Found> {
  const service = mirrorService(url);
  const res = await search(player, url, user);
  if (res.failure === 'client') throw new UserError(MUSIC_DOWN);
  if (!res.tracks.length) throw new UserError(`Couldn't read that ${service} link. Check that it's a song, album or public playlist.`);
  const songs = res.tracks.slice(0, sourceRules.maxMatchedTracks);
  const failures: Failure[] = [];
  const matched = await mapLimit(songs, sourceRules.matchConcurrency, async (song) => {
    const found = await search(player, `${song.info.author} ${song.info.title}`, user, 'scsearch');
    failures.push(found.failure);
    return bestMatch(song.info, found.tracks.slice(0, sourceRules.candidates));
  });
  if (failures.every((f) => f === 'client')) throw new UserError(MUSIC_DOWN);
  if (failures.every((f) => f !== null)) throw new UserError(SEARCH_DOWN);
  const tracks = matched.filter((t): t is Track => !!t);
  if (!tracks.length) {
    throw new UserError(songs.length === 1
      ? `Couldn't find a good SoundCloud match for **${escapeTitle(songs[0]!.info.title)}** by ${escapeTitle(songs[0]!.info.author)}. Try searching the song name.`
      : `Couldn't find good SoundCloud matches for the songs in that ${service} link.`);
  }
  return { tracks, name: res.playlist, skipped: songs.length - tracks.length, total: res.tracks.length };
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('play').setDescription('Play a song, playlist or audio file in your voice channel')
    .addStringOption((o) => o.setName('query').setDescription('Song name, or a SoundCloud, Bandcamp, Spotify or Apple Music link').setMaxLength(300))
    .addAttachmentOption((o) => o.setName('file').setDescription('An audio file to play (mp3, ogg, wav, flac, m4a…)')),
  category: 'music',
  guildOnly: true,
  // Not deferred up front, and all replies are private: the now-playing panel is the public message
  async execute({ interaction }) {
    const query = interaction.options.getString('query')?.trim() ?? '';
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

    // Not connected yet: a text search only joins once a song is picked
    const player = manager.getPlayer(interaction.guildId!) ?? manager.createPlayer({
      guildId: interaction.guildId!, voiceChannelId: channel.id, textChannelId: interaction.channelId, selfDeaf: true, volume: musicRules.defaultVolume,
    });
    const dropIfIdle = () => (!player.queue.current && !player.queue.tracks.length ? player.destroy('nothing to play').catch(() => undefined) : undefined);

    if (!file && kind === 'search') {
      let results: Track[];
      try {
        results = await searchResults(player, query, interaction.user);
      } catch (err) {
        await dropIfIdle();
        throw err;
      }
      return showPicker(interaction, player, query, results, dropIfIdle);
    }

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
      } else {
        const res = await search(player, query, interaction.user);
        if (res.failure === 'client') throw new UserError(MUSIC_DOWN);
        if (!res.tracks.length) throw new UserError(`Couldn't play that link. ${SUPPORTED}`);
        found = { tracks: res.playlist ? res.tracks : [res.tracks[0]!], name: res.playlist };
        if (found.tracks.every((t) => t.info.isStream)) throw new UserError(NO_LIVE);
        found.tracks = found.tracks.filter((t) => !t.info.isStream);
      }
    } catch (err) {
      await dropIfIdle();
      throw err;
    }

    const result = await enqueue(player, found);
    if (!result) return interaction.deleteReply();
    return interaction.editReply({ embeds: [result] });
  },
});

import type { Player, Track } from 'lavalink-client';
import { ButtonBuilder, ButtonStyle, escapeMarkdown } from 'discord.js';
import { ANYONE, makeId } from '../lib/customId';
import { embed } from '../lib/embeds';
import { titleIcon } from '../lib/icons';
import { btn, row, type Payload } from '../ui/kit';

/** A title safe inside **bold** and [link](…) markdown. */
export function escapeTitle(title: string): string {
  return escapeMarkdown(title).replace(/[[\]]/g, '').slice(0, 200);
}

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'live';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Loop button: 🔁 off (grey), 🔂 track and 🔁 queue (blue = on). */
const LOOP = { off: { emoji: '🔁', style: ButtonStyle.Secondary }, track: { emoji: '🔂', style: ButtonStyle.Primary }, queue: { emoji: '🔁', style: ButtonStyle.Primary } } as const;

/** Now-playing panel with persistent controls (`mp:*:<action>`); anyone in the voice channel can use them. */
export function nowPlayingPanel(player: Player, track: Track): Payload {
  const info = track.info;
  const requester = (track.requester as { id?: string } | undefined)?.id;
  const e = embed('music').setTitle(`${titleIcon('music')} Now playing`).setDescription([
    `**[${escapeTitle(info.title)}](${info.uri})**`,
    `${info.author} · ${info.isStream ? 'Live' : formatTime(info.duration)}${requester ? ` · added by <@${requester}>` : ''}`,
    `${player.queue.tracks.length} up next · volume ${player.volume}%${player.paused ? ' · **paused**' : ''}`,
  ].join('\n'));
  if (info.artworkUrl) e.setThumbnail(info.artworkUrl);
  // Exception to the icon rule (owner decision): transport controls are icon-only standard emojis
  const icon = (action: string, emoji: string, style: ButtonStyle = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(makeId('mp', ANYONE, action)).setEmoji(emoji).setStyle(style);
  const text = (action: string, label: string) => btn(makeId('mp', ANYONE, action), label, ButtonStyle.Secondary);
  const loop = LOOP[player.repeatMode];
  return {
    embeds: [e],
    components: [
      row(icon('pause', '⏯'), icon('skip', '⏭'), icon('loop', loop.emoji, loop.style), icon('shuffle', '🔀'), icon('stop', '⏹')),
      row(text('voldown', 'Volume −10'), text('volup', 'Volume +10'), text('queue', 'Queue')),
    ],
  };
}

/** One page of the queue as text. */
export function queuePage(player: Player, page: number, perPage: number): { text: string; pages: number } {
  const tracks = player.queue.tracks;
  const pages = Math.max(1, Math.ceil(tracks.length / perPage));
  const p = Math.min(pages - 1, Math.max(0, page));
  const now = player.queue.current;
  const lines = tracks.slice(p * perPage, (p + 1) * perPage).map((t, i) => `**${p * perPage + i + 1}.** ${escapeTitle(t.info?.title ?? 'Unknown')} · ${formatTime(t.info?.duration ?? 0)}`);
  const total = tracks.reduce((s, t) => s + (t.info?.isStream ? 0 : t.info?.duration ?? 0), 0);
  return {
    pages,
    text: [
      now ? `**Now:** [${escapeTitle(now.info.title)}](${now.info.uri}) · ${formatTime(player.position)} / ${formatTime(now.info.duration ?? 0)}` : 'Nothing playing.',
      '',
      ...(lines.length ? lines : ['The queue is empty. Add songs with `/play`.']),
      '',
      `-# ${tracks.length} track${tracks.length === 1 ? '' : 's'} · ${formatTime(total)} total · page ${p + 1} of ${pages}`,
    ].join('\n'),
  };
}

import type { Player, Track } from 'lavalink-client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { BRAND, type IconKey } from '../content/icons';
import { musicRules } from '../content/music';
import { ANYONE, makeId } from '../lib/customId';
import { bar } from '../lib/format';
import { buttonIcon, greyButtonIcon, hasIcon, icon, titleIcon } from '../lib/icons';
import { hasHistory } from './history';

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

/** Like formatTime, but 0 is "0:00" (the start of the progress line). */
function clock(ms: number): string {
  return ms > 0 ? formatTime(ms) : '0:00';
}

/** A Components V2 message (container only: no content or embeds). Mentions in it never ping. */
export interface PanelPayload {
  components: ContainerBuilder[];
  flags: MessageFlags.IsComponentsV2;
  allowedMentions: { parse: [] };
}

/** What the panel shows, captured from the player (kept after the player is gone, for the ended view). */
export interface PanelState {
  guildId: string;
  paused: boolean;
  repeatMode: 'off' | 'track' | 'queue';
  volume: number;
  upNext: number;
  position: number;
  voiceChannelId: string | null;
}

export function panelState(player: Player): PanelState {
  return {
    guildId: player.guildId,
    paused: player.paused,
    repeatMode: player.repeatMode,
    volume: player.volume,
    upNext: player.queue.tracks.length,
    position: player.position,
    voiceChannelId: player.voiceChannelId ?? null,
  };
}

export type BarPiece = 'bar_lf' | 'bar_f' | 'bar_k' | 'bar_ks' | 'bar_ke' | 'bar_e' | 'bar_re';

/** Progress bar pieces: filled cells, the knob, then empty cells, with rounded caps at both ends. */
export function progressBar(position: number, duration: number, segments: number = musicRules.barSegments): BarPiece[] {
  const frac = duration > 0 && Number.isFinite(position) ? Math.min(1, Math.max(0, position / duration)) : 0;
  const knob = Math.round(frac * (segments - 1));
  return Array.from({ length: segments }, (_, i): BarPiece => {
    if (i < knob) return i === 0 ? 'bar_lf' : 'bar_f';
    if (i > knob) return i === segments - 1 ? 'bar_re' : 'bar_e';
    return knob === 0 ? 'bar_ks' : knob === segments - 1 ? 'bar_ke' : 'bar_k';
  });
}

/** The bar as emojis, or the plain ▰▱ bar when the pieces aren't uploaded (they only look right together). */
export function renderBar(position: number, duration: number): string {
  const pieces = progressBar(position, duration);
  if (!pieces.every((p) => hasIcon(p))) return bar(position, duration, musicRules.barSegments);
  return pieces.map((p) => icon(p)).join('');
}

/** Icon-only button. Grey buttons get grey icons, blue ones white. */
function iconButton(customId: string, key: IconKey, style: ButtonStyle = ButtonStyle.Secondary, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setStyle(style).setDisabled(disabled)
    .setEmoji(style === ButtonStyle.Secondary ? greyButtonIcon(key) : buttonIcon(key));
}

function labelButton(customId: string, key: IconKey | null, label: string, style: ButtonStyle = ButtonStyle.Secondary): ButtonBuilder {
  const b = new ButtonBuilder().setCustomId(customId).setStyle(style).setLabel(label);
  if (key) b.setEmoji(style === ButtonStyle.Secondary ? greyButtonIcon(key) : buttonIcon(key));
  return b;
}

const actionRow = (...buttons: ButtonBuilder[]) => new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons);
const text = (content: string) => new TextDisplayBuilder().setContent(content);

/** Loop button: repeat (grey) off, repeat-once (blue) track, repeat (blue) queue. */
const LOOP: Record<PanelState['repeatMode'], { key: IconKey; style: ButtonStyle }> = {
  off: { key: 'mp_loop', style: ButtonStyle.Secondary },
  track: { key: 'mp_loop1', style: ButtonStyle.Primary },
  queue: { key: 'mp_loop', style: ButtonStyle.Primary },
};

/**
 * Now-playing panel (Components V2) with persistent controls (`mp:*:<action>`); anyone in the voice
 * channel can use them. With `ended`, the buttons are gone and the note replaces the progress line.
 */
export function nowPlayingPanel(state: PanelState, track: Track, ended?: string): PanelPayload {
  const info = track.info;
  const requester = (track.requester as { id?: string } | undefined)?.id;
  const container = new ContainerBuilder().setAccentColor(BRAND);

  const heading = [
    text(`-# ${titleIcon('music')} ${ended ? 'Played' : 'Now playing'}`),
    text(`### [${escapeTitle(info.title)}](${info.uri})\n${escapeTitle(info.author)}`),
  ];
  if (info.artworkUrl) {
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(heading)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(info.artworkUrl).setDescription(info.title.slice(0, 1024))));
  } else {
    container.addTextDisplayComponents(heading);
  }

  const details = [
    requester ? `Added by <@${requester}>` : null,
    state.voiceChannelId ? `in <#${state.voiceChannelId}>` : null,
  ].filter(Boolean).join(' ');
  const status = [details || null, `${state.upNext} up next`, `volume ${state.volume}%`].filter(Boolean).join(' · ');
  container.addTextDisplayComponents(text(`-# ${status}`));

  if (ended) {
    container.addTextDisplayComponents(text(`-# ${ended}`));
    return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
  }

  // Time and bar in one text block: a block of emojis alone would show them jumbo-sized
  const time = `\`${clock(state.position)} / ${formatTime(info.duration)}\``;
  const progress = `\n${renderBar(state.position, info.duration)}`;
  container.addTextDisplayComponents(text(`${time}${state.paused ? ' · **Paused**' : ''}${progress}`));

  const id = (action: string) => makeId('mp', ANYONE, action);
  const loop = LOOP[state.repeatMode];
  // Back restarts the song once it's a few seconds in (no history needed); otherwise it needs a previous track
  const canRestart = info.isSeekable !== false && state.position > musicRules.backRestartMs;
  container.addActionRowComponents(actionRow(
    iconButton(id('back'), 'mp_back', ButtonStyle.Secondary, !canRestart && !hasHistory(state.guildId)),
    iconButton(id('pause'), state.paused ? 'mp_play' : 'mp_pause', ButtonStyle.Primary),
    iconButton(id('skip'), 'mp_next'),
    iconButton(id('loop'), loop.key, loop.style),
    iconButton(id('controls'), 'mp_controls'),
  ));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** Private full controls (opened from the panel's Controls button): `mp:*:c:<action>`. */
export function controlsView(state: PanelState, track: Track): PanelPayload {
  const id = (action: string) => makeId('mp', ANYONE, 'c', action);
  const loop = state.repeatMode === 'off' ? 'off' : `the ${state.repeatMode}`;
  const container = new ContainerBuilder().setAccentColor(BRAND)
    .addTextDisplayComponents(text([
      `### ${titleIcon('mp_controls')} Controls`,
      `**${escapeTitle(track.info.title)}**`,
      `-# Volume ${state.volume}% · ${state.upNext} up next · looping ${loop}${state.paused ? ' · paused' : ''}`,
    ].join('\n')))
    .addActionRowComponents(
      actionRow(
        labelButton(id('voldown'), 'mp_voldown', '−10'),
        labelButton(id('volup'), 'mp_volup', '+10'),
        labelButton(id('shuffle'), 'mp_shuffle', 'Shuffle'),
      ),
      actionRow(
        labelButton(id('queue'), 'mp_queue', 'Queue'),
        labelButton(id('seek'), null, 'Seek'),
        labelButton(id('stop'), 'mp_stop', 'Stop', ButtonStyle.Danger),
      ),
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
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

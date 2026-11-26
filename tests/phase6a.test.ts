import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { useTestDatabase } from './helpers/db';
import { INVITE_RE, moderationBlocker, nextCase, parseDuration } from '../src/services/moderation';
import { parsePosition } from '../src/music/actions';
import { formatTime, queuePage } from '../src/music/panel';
import { canSee } from '../src/ui/screens/help';
import { getCommandList } from '../src/framework/commandList';
import '../src/framework/registry';

const member = (id: string, top: number, guildOwner = 'owner') =>
  ({ id, displayName: id, guild: { ownerId: guildOwner }, roles: { highest: { position: top } } }) as never;

describe('moderation rules', () => {
  it('checks self, the bot, the owner and role order', () => {
    const me = member('bot', 50);
    const mod = member('mod', 20);
    expect(moderationBlocker(mod, member('mod', 20), me, 'ban')).toMatch(/yourself/);
    expect(moderationBlocker(mod, member('bot', 50), me, 'ban')).toMatch(/myself/);
    expect(moderationBlocker(mod, member('owner', 1), me, 'ban')).toMatch(/owner/);
    expect(moderationBlocker(mod, member('peer', 20), me, 'ban')).toMatch(/above yours/);
    expect(moderationBlocker(mod, member('big', 10), member('bot', 5), 'ban')).toMatch(/above mine/);
    expect(moderationBlocker(mod, member('user', 10), me, 'ban')).toBeNull();
    // The owner can act on anyone below the bot
    expect(moderationBlocker(member('owner', 1), member('user', 10), me, 'ban')).toBeNull();
  });

  it('parses durations and catches invite links', () => {
    expect(parseDuration('10m')).toBe(600_000);
    expect(parseDuration('1d 12h')).toBe(129_600_000);
    expect(parseDuration('2w')).toBe(1_209_600_000);
    expect(parseDuration('ten minutes')).toBeNull();
    expect(parseDuration('10x')).toBeNull();
    for (const link of ['discord.gg/abc', 'https://discord.com/invite/x-y', 'discordapp.com/invite/Z']) expect(INVITE_RE.test(link), link).toBe(true);
    expect(INVITE_RE.test('discord.com/channels/1/2')).toBe(false);
  });

  it('moderation commands are hidden from members without the permission', () => {
    const mod = getCommandList().filter((c) => c.category === 'moderation').map((c) => c.data.toJSON());
    expect(mod.map((c) => c.name).sort()).toEqual(['ban', 'kick', 'purge', 'rolepanel', 'timeout', 'unban', 'untimeout', 'warn', 'warnings']);
    for (const c of mod) {
      expect(c.default_member_permissions, c.name).toBeTruthy();
      expect(canSee(c, '0'), c.name).toBe(false);
      expect(canSee(c, PermissionFlagsBits.Administrator.toString()) || canSee(c, (PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.ManageMessages | PermissionFlagsBits.ManageRoles).toString()), c.name).toBe(true);
    }
  });
});

describe('music helpers', () => {
  it('formats and parses times', () => {
    expect(formatTime(0)).toBe('live');
    expect(formatTime(83_000)).toBe('1:23');
    expect(formatTime(3_723_000)).toBe('1:02:03');
    expect(parsePosition('1:30')).toBe(90_000);
    expect(parsePosition('83')).toBe(83_000);
    expect(parsePosition('1:02:03')).toBe(3_723_000);
    expect(parsePosition('abc')).toBeNull();
  });

  it('pages the queue', () => {
    const track = (n: number) => ({ info: { title: `Song ${n}`, duration: 60_000, uri: 'https://x', isStream: false } });
    const player = { queue: { current: track(0), tracks: Array.from({ length: 23 }, (_, i) => track(i + 1)) }, position: 30_000 } as never;
    const p1 = queuePage(player, 0, 10);
    expect(p1.pages).toBe(3);
    expect(p1.text).toMatch(/\*\*1\.\*\* Song 1/);
    expect(queuePage(player, 2, 10).text).toMatch(/\*\*23\.\*\* Song 23/);
    expect(queuePage(player, 9, 10).text).toMatch(/page 3 of 3/);
  });
});

describe('moderation cases (database)', () => {
  useTestDatabase();

  it('case numbers count up per server without gaps or repeats, even concurrently', async () => {
    const cases = await Promise.all(Array.from({ length: 10 }, () => nextCase('g1')));
    expect([...cases].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await nextCase('g2')).toBe(1);
  });
});

describe('review fixes', () => {
  it('catches dsc.gg and captures the invite code (for the vanity exemption)', () => {
    expect(INVITE_RE.exec('join dsc.gg/cool')?.[1]).toBe('cool');
    expect(INVITE_RE.exec('https://discord.gg/AbC-12')?.[1]).toBe('AbC-12');
  });

  it('escapes track titles so they can\'t break links or bold', async () => {
    const { escapeTitle } = await import('../src/music/panel.js');
    expect(escapeTitle('[Official] **Song**')).toBe('Official \\*\\*Song\\*\\*');
  });

  it('voice checks: same channel required, moderators can control from anywhere', async () => {
    const { voiceCheck } = await import('../src/music/manager.js');
    const m = (channelId: string | null, mod = false) => ({ voice: { channel: channelId ? { id: channelId } : null }, permissions: { has: () => mod } }) as never;
    const player = { voiceChannelId: 'vc1' } as never;
    expect(voiceCheck(m(null), undefined)).toMatch(/Join a voice channel/);
    expect(voiceCheck(m('vc2'), player)).toMatch(/I'm playing in/);
    expect(voiceCheck(m('vc1'), player)).toBeNull();
    expect(voiceCheck(m(null, true), player)).toBeNull();
  });

  it('every command answers within Discord\'s 3 seconds: slow moderation commands defer', () => {
    const slow = ['kick', 'timeout', 'untimeout', 'warn', 'unban', 'purge', 'warnings'];
    for (const c of getCommandList().filter((x) => slow.includes(x.data.name))) expect(c.defer, c.data.name).toBeTruthy();
  });
});

describe('music panel', () => {
  const track = (title: string, extra: Record<string, unknown> = {}) =>
    ({ encoded: title, info: { title, uri: 'https://x', author: 'A', duration: 274_000, isStream: false, isSeekable: true, artworkUrl: 'https://img', ...extra }, requester: { id: '1' } }) as never;
  const state = (over: Record<string, unknown> = {}) =>
    ({ guildId: 'g1', paused: false, repeatMode: 'off', volume: 80, upNext: 2, position: 83_000, voiceChannelId: 'vc', ...over }) as never;
  type Json = { type: number; custom_id?: string; label?: string; components?: Json[]; content?: string; emoji?: { name: string }; style?: number; disabled?: boolean; accessory?: unknown; accent_color?: number };
  const json = (p: { components: { toJSON(): unknown }[] }) => p.components[0]!.toJSON() as Json;
  const buttons = (c: Json) => c.components!.filter((x) => x.type === 1).flatMap((r) => r.components!);
  const texts = (c: Json): string => c.components!.flatMap((x) => x.type === 10 ? [x.content!] : x.type === 9 ? x.components!.map((t) => t.content!) : []).join('\n');

  it('progress bar: caps, knob at 0%, 40% and 100%, no duration', async () => {
    const { progressBar } = await import('../src/music/panel.js');
    expect(progressBar(0, 100, 14)).toEqual(['bar_ks', ...Array(12).fill('bar_e'), 'bar_re']);
    const mid = progressBar(40, 100, 14);
    expect(mid[0]).toBe('bar_lf');
    expect(mid.indexOf('bar_k')).toBe(5);
    expect(mid.at(-1)).toBe('bar_re');
    expect(progressBar(100, 100, 14)).toEqual(['bar_lf', ...Array(12).fill('bar_f'), 'bar_ke']);
    expect(progressBar(500, 100, 14)).toEqual(progressBar(100, 100, 14));
    expect(progressBar(10, 0, 14)[0]).toBe('bar_ks');
    expect(progressBar(0, 100, 14)).toHaveLength(14);
  });

  it('Components V2 container: accent, thumbnail, time above the bar, five buttons', async () => {
    const { nowPlayingPanel } = await import('../src/music/panel.js');
    const { BRAND } = await import('../src/content/icons.js');
    const { ButtonStyle, MessageFlags } = await import('discord.js');
    const p = nowPlayingPanel(state(), track('Song'));
    expect(p.flags).toBe(MessageFlags.IsComponentsV2);
    const c = json(p);
    expect(c.type).toBe(17);
    expect(c.accent_color).toBe(BRAND);
    expect(c.components![0]!.type).toBe(9);
    expect(texts(c)).toMatch(/`1:23 \/ 4:34`\n[▰▱]{14}/);
    expect(texts(c)).toMatch(/Added by <@1> in <#vc>/);
    const b = buttons(c);
    expect(b.map((x) => x.custom_id?.split(':').pop())).toEqual(['back', 'pause', 'skip', 'loop', 'controls']);
    expect(b[1]).toMatchObject({ style: ButtonStyle.Primary });
    expect(b[0]!.disabled).toBe(true); // no history yet
    expect(b.every((x) => !x.label)).toBe(true);
    // No artwork: no section
    expect(json(nowPlayingPanel(state(), track('Song', { artworkUrl: null }))).components![0]!.type).toBe(10);
    // Streams: no bar
    expect(texts(json(nowPlayingPanel(state(), track('Live', { isStream: true }))))).not.toMatch(/[▰▱]/);
  });

  it('loop and play/pause show their state; ended panels lose their buttons', async () => {
    const { nowPlayingPanel } = await import('../src/music/panel.js');
    const { ButtonStyle } = await import('discord.js');
    const loopBtn = (mode: string) => buttons(json(nowPlayingPanel(state({ repeatMode: mode }), track('S'))))[3]!;
    expect(loopBtn('off')).toMatchObject({ style: ButtonStyle.Secondary, emoji: { name: '🔁' } });
    expect(loopBtn('track')).toMatchObject({ style: ButtonStyle.Primary, emoji: { name: '🔂' } });
    expect(loopBtn('queue')).toMatchObject({ style: ButtonStyle.Primary, emoji: { name: '🔁' } });
    expect(buttons(json(nowPlayingPanel(state({ paused: true }), track('S'))))[1]).toMatchObject({ emoji: { name: '▶️' } });
    expect(buttons(json(nowPlayingPanel(state(), track('S'))))[1]).toMatchObject({ emoji: { name: '⏸️' } });
    const ended = json(nowPlayingPanel(state(), track('S'), 'Stopped.'));
    expect(buttons(ended)).toHaveLength(0);
    expect(texts(ended)).toMatch(/Stopped\./);
  });

  it('uses the uploaded bar and grey/white icons when they exist', async () => {
    const { nowPlayingPanel } = await import('../src/music/panel.js');
    const { iconDefs } = await import('../src/content/icons.js');
    const { setLoadedIconsForTest } = await import('../src/lib/icons.js');
    setLoadedIconsForTest(Object.fromEntries(Object.keys(iconDefs).flatMap((k, i) => ['b', 'w', 'g', 'c'].map((v, j) =>
      [`${k}.${v}`, { id: `1234567890123${String(i).padStart(3, '0')}${j}`, name: `oi_${k}_${v}_abc123` }]))));
    try {
      const c = json(nowPlayingPanel(state(), track('S')));
      expect(texts(c)).toMatch(/^<:oi_bar_lf_c_abc123:\d+>/m);
      const b = buttons(c);
      expect(b[1]!.emoji!.name).toBe('oi_mp_pause_w_abc123');
      expect(b.filter((x, i) => i !== 1).every((x) => x.emoji!.name.endsWith('_g_abc123'))).toBe(true);
    } finally {
      setLoadedIconsForTest({});
    }
  });

  it('history: newest first, capped, track loops are one entry, Back does not re-add', async () => {
    const { recordStart, takePrevious, hasHistory, clearHistory } = await import('../src/music/history.js');
    const g = 'hist';
    clearHistory(g);
    expect(hasHistory(g)).toBe(false);
    for (let i = 0; i < 25; i++) recordStart(g, track(`t${i}`), false);
    // Looping t24 doesn't push copies
    recordStart(g, track('t24'), true);
    recordStart(g, track('t24'), true);
    expect(takePrevious(g)!.info.title).toBe('t23');
    // Back started t23: t24 went to the queue, not the history
    recordStart(g, track('t23'), false);
    expect(takePrevious(g)!.info.title).toBe('t22');
    recordStart(g, track('t22'), false);
    let n = 0;
    while (takePrevious(g)) { n++; recordStart(g, track('x'), false); }
    expect(n).toBeLessThanOrEqual(20);
    clearHistory(g);
  });

  it('Back restarts after 5 seconds, otherwise plays the previous track and requeues the current one', async () => {
    const { back } = await import('../src/music/actions.js');
    const { recordStart, clearHistory } = await import('../src/music/history.js');
    const calls: string[] = [];
    const fake = (position: number) => ({
      guildId: 'bk', position, queue: { current: track('now'), add: async (t: { info: { title: string } }, i: number) => calls.push(`add ${t.info.title}@${i}`) },
      seek: async (ms: number) => calls.push(`seek ${ms}`), play: async (o: { clientTrack: { info: { title: string } } }) => calls.push(`play ${o.clientTrack.info.title}`),
    }) as never;
    clearHistory('bk');
    await expect(back(fake(1000))).rejects.toThrow(/Nothing to go back/);
    expect(await back(fake(9000))).toMatch(/Restarted/);
    recordStart('bk', track('prev'), false);
    recordStart('bk', track('now'), false);
    await back(fake(1000));
    expect(calls).toEqual(['seek 0', 'add now@0', 'play prev']);
    clearHistory('bk');
  });

  it('Back puts everything back when the previous track fails to play', async () => {
    const { back } = await import('../src/music/actions.js');
    const { recordStart, clearHistory, hasHistory } = await import('../src/music/history.js');
    const calls: string[] = [];
    const fake = { guildId: 'bf', position: 0, queue: { current: track('now'), add: async () => calls.push('add'), remove: async (i: number) => calls.push(`remove ${i}`) },
      play: async () => { throw new Error('boom'); } } as never;
    clearHistory('bf');
    recordStart('bf', track('prev'), false);
    recordStart('bf', track('now'), false);
    await expect(back(fake)).rejects.toThrow('boom');
    expect(calls).toEqual(['add', 'remove 0']);
    expect(hasHistory('bf')).toBe(true);
    // The next real start is recorded normally
    recordStart('bf', track('next'), false);
    clearHistory('bf');
  });

  it('refresh ticker: least recently edited first, never more than the cap', async () => {
    const { pickRefreshes } = await import('../src/music/manager.js');
    const c = [{ guildId: 'a', lastEdit: 30 }, { guildId: 'b', lastEdit: 10 }, { guildId: 'c', lastEdit: 20 }];
    expect(pickRefreshes(c, 2)).toEqual(['b', 'c']);
    expect(pickRefreshes(c, 0)).toEqual([]);
    expect(pickRefreshes(c, 10)).toHaveLength(3);
  });

  it('controls view has shuffle, stop, volume, queue and seek', async () => {
    const { controlsView } = await import('../src/music/panel.js');
    const ids = buttons(json(controlsView(state(), track('S')))).map((x) => x.custom_id!.split(':').slice(-2).join(':'));
    expect(ids).toEqual(['c:voldown', 'c:volup', 'c:shuffle', 'c:queue', 'c:seek', 'c:stop']);
  });
});

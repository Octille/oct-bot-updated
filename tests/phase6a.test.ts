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
    expect(mod.map((c) => c.name).sort()).toEqual(['ban', 'kick', 'purge', 'timeout', 'unban', 'untimeout', 'warn', 'warnings']);
    for (const c of mod) {
      expect(c.default_member_permissions, c.name).toBeTruthy();
      expect(canSee(c, '0'), c.name).toBe(false);
      expect(canSee(c, PermissionFlagsBits.Administrator.toString()) || canSee(c, (PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.ManageMessages).toString()), c.name).toBe(true);
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
  it('icon-only grey transport buttons, loop shows its state, text for volume and queue', async () => {
    const { nowPlayingPanel } = await import('../src/music/panel.js');
    const { ButtonStyle } = await import('discord.js');
    const track = { info: { title: 'Song', uri: 'https://x', author: 'A', duration: 60_000, isStream: false }, requester: { id: '1' } };
    const view = (repeatMode: string) => nowPlayingPanel({ queue: { tracks: [] }, volume: 80, paused: false, repeatMode } as never, track as never)
      .components.map((r) => r.toJSON().components) as unknown as { emoji?: { name: string }; label?: string; style: number }[][];
    const [transport, extra] = view('off');
    expect(transport!.map((b) => b.emoji?.name)).toEqual(['⏯', '⏭', '🔁', '🔀', '⏹']);
    expect(transport!.every((b) => !b.label && b.style === ButtonStyle.Secondary)).toBe(true);
    expect(extra!.map((b) => b.label)).toEqual(['Volume −10', 'Volume +10', 'Queue']);
    expect(view('track')[0]![2]).toMatchObject({ emoji: { name: '🔂' }, style: ButtonStyle.Primary });
    expect(view('queue')[0]![2]).toMatchObject({ emoji: { name: '🔁' }, style: ButtonStyle.Primary });
  });
});

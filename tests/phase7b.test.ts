import { describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';
import { legacyRolesFor, setLegacyReactionRoles } from '../src/services/legacyReactionRoles';
import { noticeActive, oldCommandOf, prefixNotice } from '../src/services/prefixNotice';

describe('legacy reaction roles', () => {
  setLegacyReactionRoles([
    { guildId: 'g1', messageId: 'm1', emoji: '✅', roleId: 'r1' },
    { guildId: 'g1', messageId: 'm1', emoji: '123456789012345678', roleId: 'r2' },
    { guildId: 'g1', messageId: 'm1', emoji: '<:party:223456789012345678>', roleId: 'r3' },
    { guildId: 'g1', messageId: 'm2', emoji: '⛏️', roleId: 'r4' },
  ]);

  it('matches unicode and custom emojis as v2 stored them', () => {
    expect(legacyRolesFor('g1', 'm1', { id: null, name: '✅' })).toEqual(['r1']);
    expect(legacyRolesFor('g1', 'm1', { id: '123456789012345678', name: 'cool' })).toEqual(['r2']);
    expect(legacyRolesFor('g1', 'm1', { id: '223456789012345678', name: 'party' })).toEqual(['r3']);
    expect(legacyRolesFor('g1', 'm2', { id: null, name: '⛏' })).toEqual(['r4']); // with or without the variation selector
  });

  it('ignores other messages, emojis and servers', () => {
    expect(legacyRolesFor('g1', 'm3', { id: null, name: '✅' })).toEqual([]);
    expect(legacyRolesFor('g1', 'm1', { id: null, name: '❌' })).toEqual([]);
    expect(legacyRolesFor('g2', 'm1', { id: null, name: '✅' })).toEqual([]);
  });
});

describe('prefix notice', () => {
  it('recognises old commands and aliases only', () => {
    expect(oldCommandOf('!bal')).toBe('bal');
    expect(oldCommandOf('!Daily please')).toBe('daily');
    expect(oldCommandOf('! play song')).toBe('play');
    expect(oldCommandOf('!!!')).toBeNull();
    expect(oldCommandOf('!wow nice')).toBeNull();
    expect(oldCommandOf('hello !bal')).toBeNull();
  });

  it('runs for 30 days from the launch date, and is off when unset', () => {
    const launch = '2026-12-15T00:00:00Z';
    const t = (iso: string) => new Date(iso).getTime();
    expect(noticeActive(t('2026-12-14T23:00:00Z'), launch)).toBe(false);
    expect(noticeActive(t('2026-12-15T01:00:00Z'), launch)).toBe(true);
    expect(noticeActive(t('2027-01-13T23:00:00Z'), launch)).toBe(true);
    expect(noticeActive(t('2027-01-14T01:00:00Z'), launch)).toBe(false);
    expect(noticeActive(t('2026-12-20T00:00:00Z'), undefined)).toBe(false);
  });

  it('replies at most once per channel per hour', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const msg = (channelId: string, content = '!bal') => ({ content, channelId, reply }) as unknown as Message<true>;
    const launch = '2026-12-15T00:00:00Z';
    const now = new Date('2026-12-16T10:00:00Z').getTime();
    expect(await prefixNotice(msg('c1'), now, launch)).toBe(true);
    expect(await prefixNotice(msg('c1'), now + 60_000, launch)).toBe(true);
    expect(await prefixNotice(msg('c2'), now + 60_000, launch)).toBe(true);
    expect(await prefixNotice(msg('c1'), now + 3_600_001, launch)).toBe(true);
    expect(await prefixNotice(msg('c1', 'just chatting'), now + 7_300_000, launch)).toBe(false);
    expect(reply).toHaveBeenCalledTimes(3);
  });
});

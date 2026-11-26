import { describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';
import { legacyRolesFor, setLegacyReactionRoles } from '../src/services/legacyReactionRoles';

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

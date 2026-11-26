import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { useTestDatabase } from './helpers/db';
import { parsePanelEmoji, renderRolePanel, roleBlocker, toggleRoles } from '../src/services/roles';
import { DEFAULT_WELCOME, welcomeText } from '../src/services/welcome';
import { formatTranscript, ticketName } from '../src/services/tickets';
import { parseAnswers } from '../src/commands/utility/poll';
import { cleanReason } from '../src/services/afk';
import { SECTIONS, settingsScreen, type Section, type Settings } from '../src/ui/settings';
import { Ticket } from '../src/models/Ticket';
import { getCommandList } from '../src/framework/commandList';
import { canSee } from '../src/ui/screens/help';
import '../src/framework/registry';

const perms = (...p: bigint[]) => new PermissionsBitField(p);
const guild = { id: 'g', ownerId: 'owner' };
const me = { id: 'bot', permissions: perms(PermissionFlagsBits.ManageRoles), roles: { highest: { position: 10 } } };
const roleAt = (position: number, extra: Partial<{ id: string; managed: boolean; permissions: PermissionsBitField }> = {}) =>
  ({ id: 'r', name: 'Gamer', managed: false, position, permissions: perms(), ...extra });

describe('role safety', () => {
  it('refuses @everyone, managed, dangerous and too-high roles', () => {
    expect(roleBlocker(roleAt(1, { id: 'g' }), guild, me)).toMatch(/everyone/);
    expect(roleBlocker(roleAt(1, { managed: true }), guild, me)).toMatch(/managed/);
    for (const p of [PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.MentionEveryone]) {
      expect(roleBlocker(roleAt(1, { permissions: perms(p) }), guild, me)).toMatch(/moderator or admin/);
    }
    expect(roleBlocker(roleAt(10), guild, me)).toMatch(/Move my role/);
    expect(roleBlocker(roleAt(1), guild, { ...me, permissions: perms() })).toMatch(/Manage Roles/);
    expect(roleBlocker(roleAt(5), guild, me)).toBeNull();
  });

  it('the person setting it up must outrank the role (the owner is exempt)', () => {
    const mod = { id: 'mod', permissions: perms(), roles: { highest: { position: 5 } } };
    expect(roleBlocker(roleAt(5), guild, me, mod)).toMatch(/your highest role/);
    expect(roleBlocker(roleAt(4), guild, me, mod)).toBeNull();
    expect(roleBlocker(roleAt(5), guild, me, { ...mod, id: 'owner' })).toBeNull();
  });

  it('emoji and toggles', () => {
    expect(parsePanelEmoji('🎮')).toBe('🎮');
    expect(parsePanelEmoji('<:pepe:123456789012345678>')).toBe('<:pepe:123456789012345678>');
    expect(parsePanelEmoji('')).toBeNull();
    expect(parsePanelEmoji('hello')).toBe(false);
    expect(parsePanelEmoji('<@&123456789012345678>')).toBe(false);
    expect(toggleRoles(['a', 'b', 'a'], (r) => r === 'a')).toEqual({ add: ['b'], remove: ['a'] });
  });

  it('panels fit Discord limits with 25 roles, and never ping', () => {
    const roles = Array.from({ length: 25 }, (_, i) => ({ roleId: String(100000000000000000n + BigInt(i)), label: `Role ${i}`, emoji: i % 2 ? '🎮' : null }));
    const names = new Map(roles.map((r) => [r.roleId, r.label]));
    const buttons = renderRolePanel({ _id: 'a'.repeat(24), title: 'T', style: 'buttons', roles }, names);
    expect(buttons.components).toHaveLength(5);
    expect(buttons.components.every((r) => r.components.length <= 5)).toBe(true);
    const select = renderRolePanel({ _id: 'a'.repeat(24), title: 'T', style: 'select', roles }, names);
    const menu = select.components[0]!.toJSON().components[0] as { options: unknown[]; max_values: number; custom_id: string };
    expect(menu.options).toHaveLength(25);
    expect(menu.max_values).toBe(25);
    expect(menu.custom_id.length).toBeLessThanOrEqual(100);
  });
});

describe('welcome', () => {
  it('fills the template once, escapes names and only mentions the new member', () => {
    expect(welcomeText(null, { id: '1', name: 'A', server: 'S', count: 1234 })).toBe(DEFAULT_WELCOME.replace('{server}', 'S').replace('{user}', '<@1>').replace('{count}', '1,234'));
    const t = welcomeText('{name} joined {server} {user}', { id: '1', name: '{user} @everyone **x**', server: '[link](http://x)', count: 2 });
    expect(t).not.toMatch(/@everyone/);
    expect(t.match(/<@1>/g)).toHaveLength(1);
    expect(t).toContain('\\*\\*x\\*\\*');
    expect(t).not.toMatch(/\[link\]\(/);
  });
});

describe('tickets', () => {
  it('transcript is oldest first with attachments, and names are tidy', () => {
    const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
    const text = formatTranscript({ server: 'S', channel: 'ticket-0001-a', number: 1, ownerId: '9', truncated: false }, [
      { at: at(5), author: 'b', authorId: '2', bot: false, content: 'second', attachments: ['https://cdn/x.png'], embeds: 0 },
      { at: at(1), author: 'a', authorId: '1', bot: true, content: 'first', attachments: [], embeds: 1 },
    ]);
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
    expect(text).toContain('[attachment] https://cdn/x.png');
    expect(text).toContain('[bot]');
    expect(ticketName(7, 'Cool Guy!!')).toBe('ticket-0007-cool-guy');
    expect(ticketName(12, '___')).toBe('ticket-0012-member');
  });

  describe('database rules', () => {
    useTestDatabase();
    it('role panels never grow past 25 roles, even with concurrent adds', async () => {
      const { RolePanel } = await import('../src/models/RolePanel.js');
      const p = await RolePanel.create({ guildId: 'g', channelId: 'c', title: 'T', roles: Array.from({ length: 24 }, (_, i) => ({ roleId: `r${i}` })) });
      const add = (roleId: string) => RolePanel.findOneAndUpdate({ _id: p._id, 'roles.roleId': { $ne: roleId }, 'roles.24': { $exists: false } }, { $push: { roles: { roleId } } }, { new: true });
      const results = await Promise.all([add('x'), add('y')]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await RolePanel.findById(p._id))!.roles).toHaveLength(25);
    });

    it('a second open ticket is refused, a new one after closing is fine', async () => {
      await Ticket.create({ guildId: 'g', ownerId: 'u', number: 1, mode: 'thread' });
      await expect(Ticket.create({ guildId: 'g', ownerId: 'u', number: 2, mode: 'thread' })).rejects.toMatchObject({ code: 11000 });
      await Ticket.updateOne({ number: 1 }, { $set: { status: 'closed' } });
      await expect(Ticket.create({ guildId: 'g', ownerId: 'u', number: 3, mode: 'thread' })).resolves.toBeTruthy();
      await expect(Ticket.create({ guildId: 'other', ownerId: 'u', number: 1, mode: 'thread' })).resolves.toBeTruthy();
    });
  });
});

describe('misc', () => {
  it('poll answers and AFK reasons', () => {
    expect(parseAnswers(' Pizza | Tacos |  | Pizza\nSushi ')).toEqual(['Pizza', 'Tacos', 'Sushi']);
    expect(cleanReason('  lunch   @everyone [x](y) ')).toBe('lunch @​everyone xy');
    expect(cleanReason('')).toBeNull();
  });

  it('admin commands are hidden in /help from members without the permission', () => {
    const json = (name: string) => getCommandList().find((c) => c.data.name === name)!.data.toJSON();
    expect(canSee(json('rolepanel'), '0')).toBe(false);
    expect(canSee(json('rolepanel'), String(PermissionFlagsBits.ManageRoles))).toBe(true);
    expect(canSee(json('settings'), String(PermissionFlagsBits.ManageRoles))).toBe(false);
    expect(canSee(json('poll'), '0')).toBe(true);
  });
});

describe('/settings dashboard', () => {
  const full: Settings = {
    levels: { announce: 'channel', channelId: '111111111111111111', rewards: Array.from({ length: 25 }, (_, i) => ({ level: i + 1, roleId: `2${String(i).padStart(17, '0')}` })),
      stackRewards: true, noXpChannelIds: Array.from({ length: 25 }, (_, i) => `3${String(i).padStart(17, '0')}`), voiceXp: true, weekendDoubleXp: false },
    drops: { enabled: true, channelIds: ['444444444444444444'], perHour: 3 },
    events: { channelId: '555555555555555555' },
    welcome: { channelId: '666666666666666666', card: true, message: 'x'.repeat(1000) },
    modLogChannelId: '777777777777777777', automod: { inviteFilter: true }, autoRoleId: '888888888888888888',
    tickets: { panelChannelId: '999999999999999999', staffRoleId: '101010101010101010', mode: 'channel' },
    gamblingEnabled: true,
  };
  const owner = '123456789012345678';

  it('every section fits Discord limits, empty or full', () => {
    for (const s of [full, {}]) {
      for (const section of ['home', ...Object.keys(SECTIONS)] as (Section | 'home')[]) {
        const view = settingsScreen(section, s, owner, 'Saved.');
        expect(view.components.length, section).toBeLessThanOrEqual(5);
        expect(view.components.length, section).toBeGreaterThan(0);
        const desc = view.embeds[0]!.toJSON().description ?? '';
        expect(desc.length, section).toBeLessThanOrEqual(4096);
        for (const row of view.components) {
          const comps = row.toJSON().components as { custom_id?: string; options?: unknown[]; type: number }[];
          expect(comps.length).toBeLessThanOrEqual(5);
          for (const c of comps) {
            expect(c.custom_id!.length).toBeLessThanOrEqual(100);
            expect(c.custom_id!.startsWith(`st:${owner}:`)).toBe(true);
            if (c.options) expect(c.options.length).toBeLessThanOrEqual(25);
          }
        }
      }
    }
  });

  it('home lists every section; sections have a Back button', () => {
    const home = settingsScreen('home', full, owner);
    expect(home.embeds[0]!.toJSON().description).toContain('Tickets');
    const ids = (section: Section) => settingsScreen(section, full, owner).components.flatMap((r) => (r.toJSON().components as { custom_id: string }[]).map((c) => c.custom_id));
    for (const section of Object.keys(SECTIONS) as Section[]) expect(ids(section)).toContain(`st:${owner}:nav`);
  });
});

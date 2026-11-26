import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { totalXpForLevel } from '../src/content/levels';
import { bankCapacity, economyConfig } from '../src/content/economy';
import { veteranThresholds } from '../src/content/veteran';
import { getItem } from '../src/content/items';
import {
  convert, convertGuild, isActive, itemMap, mergeLegacy, migrationCeiling, MIGRATION_SOURCE, readLegacy, veteranTierOf,
} from '../src/migration/v2';
import { runMigration } from '../src/migration/run';
import { User } from '../src/models/User';
import { GuildSettings } from '../src/models/GuildSettings';
import { Transaction } from '../src/models/Transaction';
import { apply, ensureUser, getProfile, loadProfile, loadProfileDetailed } from '../src/services/economy';

const at = (iso: string) => Types.ObjectId.createFromTime(Math.floor(new Date(iso).getTime() / 1000));
const NOW = new Date('2026-12-01T00:00:00Z');
const ceiling = migrationCeiling();

/** A v12-era profile document as the old bot stored it. */
function v2(userID: string, joined: string, extra: Record<string, unknown> = {}) {
  return { _id: at(joined), userID, serverID: '111111111111111111', coins: 1000, bank: 0, ...extra };
}
const commands = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`cmd${i}`, new Date('2021-05-01')]));

describe('v2 conversion (pure)', () => {
  it('derives a ceiling near the approved ₪15.4M and agrees with the corrupt threshold', () => {
    expect(ceiling).toBeGreaterThan(14_000_000);
    expect(ceiling).toBeLessThan(17_000_000);
    expect(Math.abs(ceiling - veteranThresholds.corruptAbove) / veteranThresholds.corruptAbove).toBeLessThan(0.05);
  });

  it('reads dirty values without throwing', () => {
    const l = readLegacy({ userID: '222222222222222222', coins: '1.49e57', bank: -50, level: 'abc', xp: NaN, Items: { CommonFish: '3', RareFish: -2, MythicFish: null }, Mine: null, Company: 'x' });
    expect(l.corrupt).toBe(true);
    expect(l.level).toBe(0);
    expect(l.xp).toBe(0);
    expect(l.items).toEqual({ CommonFish: 3 });
    expect(l.toolTier).toBe(-1);
    expect(l.workers).toBe(0);
  });

  it('clamps corrupt wallets and moves bank overflow to the wallet, capped at the ceiling', () => {
    const corrupt = convert(readLegacy(v2('1', '2021-03-01', { coins: 1.49e57, bank: 5e31, Mine: { toolTier: 2 }, commands_cooldowns: commands(9) })), NOW);
    expect(corrupt.wallet).toBe(ceiling);
    expect(corrupt.clamps.wallet).toBe(true);
    expect(corrupt.bank).toBe(bankCapacity(corrupt.fields['account.level'] as number, 0));
    expect(corrupt.tier).toBe('veteran'); // corrupt players get base Veteran only

    const overflow = convert(readLegacy(v2('1', '2021-03-01', { coins: 500, bank: 100_000, commands_cooldowns: commands(2) })), NOW);
    const cap = bankCapacity(overflow.fields['account.level'] as number, 0);
    expect(overflow.bank).toBe(cap);
    expect(overflow.wallet).toBe(500 + (100_000 - cap));

    const negative = convert(readLegacy(v2('1', '2021-03-01', { coins: -400, bank: -1, commands_cooldowns: commands(2) })), NOW);
    expect(negative.wallet).toBe(0);
    expect(negative.bank).toBe(0);
  });

  it('re-fits levels to the v3 curve without ever lowering them', () => {
    for (const level of [1, 2, 3]) {
      const c = convert(readLegacy(v2('1', '2021-03-01', { level, xp: 50 })), NOW);
      expect(c.fields['account.level']).toBeGreaterThanOrEqual(level);
      expect(c.fields['account.best']).toBe(c.fields['account.level']);
      expect(c.fields['account.xp']).toBeGreaterThanOrEqual(totalXpForLevel(c.fields['account.level'] as number));
    }
    const huge = convert(readLegacy(v2('1', '2021-03-01', { level: 9999, xp: 1e40 })), NOW);
    expect(huge.fields['account.level']).toBe(35);
  });

  it('awards tiers from activity and join date, never balance', () => {
    const tier = (joined: string, extra: Record<string, unknown>) => veteranTierOf(readLegacy(v2('1', joined, extra)));
    expect(tier('2021-03-01', { commands_cooldowns: commands(5) })).toBe('founder');
    expect(tier('2021-03-01', { commands_cooldowns: commands(4) })).toBe('veteran');
    expect(tier('2021-08-01', { commands_cooldowns: commands(8) })).toBe('elite');
    expect(tier('2021-08-01', { commands_cooldowns: commands(7), coins: 1e12 })).toBe('veteran');
    expect(tier('2022-08-01', { commands_cooldowns: commands(1) })).toBeNull();
    expect(tier('2022-08-01', { Items: { Cookies: 2 } })).toBe('veteran');
    expect(tier('2022-08-01', { Company: { workers: 1 } })).toBe('veteran');
    expect(tier('2022-08-01', { topggrewards: 'Claimed' })).toBe('veteran');
    expect(tier('2022-08-01', { topggrewards: 'NotClaimed' })).toBeNull();
    expect(tier('2022-08-01', { Items: { Shirt: 1, Pants: 1 } })).toBeNull(); // the v12 starting items
    expect(tier('2022-08-01', { cooldowns: { id: '1' }, commands_cooldowns: [{ name: 'help', time: '1' }] })).toBeNull(); // `id` isn't a command
    expect(tier('2022-08-01', { commands_cooldowns: [{ name: 'help', time: '1' }, { name: 'help', time: '2' }] })).toBe('veteran'); // uses, repeats count
    expect(tier('2022-08-01', { Company: { miners: 2, workers: 0 } })).toBe('veteran');
    expect(tier('2021-03-01', { coins: 9_000_000 })).toBeNull(); // rich but never played: no tier
    // April 2026 relaunch: any sign of play, but never more than base Veteran
    expect(tier('2026-04-20', { xp: 10, commands_cooldowns: commands(12) })).toBe('veteran');
    expect(tier('2026-04-20', {})).toBeNull();
  });

  it('merges duplicate documents without multiplying anything', () => {
    const a = readLegacy(v2('1', '2021-02-01', { coins: 5_000, Items: { CommonFish: 10 }, commands_cooldowns: commands(1) }));
    const b = readLegacy(v2('1', '2021-07-01', { coins: 9_000, Items: { CommonFish: 7, RareFish: 2 }, commands_cooldowns: { work: new Date(), fish: new Date(), cmd0: new Date() } }));
    const m = mergeLegacy([a, b]);
    expect(m.coins).toBe(9_000); // the more active one's balance, not the sum
    expect(m.items).toEqual({ CommonFish: 10, RareFish: 2 });
    expect(m.commands).toEqual(['cmd0', 'fish', 'work']);
    expect(m.commandUses).toBe(3);
    expect(m.createdAt.toISOString().slice(0, 10)).toBe('2021-02-01');
    expect(m.docCount).toBe(2);
  });

  it('maps items, tools, workers and wages', () => {
    const c = convert(readLegacy(v2('1', '2021-03-01', {
      Items: { CommonFish: 4, MythicFish: 1_000_000, Shirt: 1, FishingRod: 1, Mystery: 3 },
      Mine: { toolTier: 3 },
      Company: { workers: 18, hasManager: true, pendingWages: 2_000, lastCollected: new Date(NOW.getTime() - 2 * 3_600_000) },
    })), NOW);
    expect(Object.values(itemMap).every((id) => getItem(id))).toBe(true);
    expect(c.fields['inventory.fish_perch']).toBe(4);
    expect(c.fields['inventory.fish_octopus']).toBeLessThan(1_000);
    expect(c.clamps.items).toContain('MythicFish');
    expect(c.fields['inventory.v2_shirt']).toBe(1);
    expect(c.unknownItems).toEqual(['Mystery']);
    expect(c.fields['tools.pickaxe.id']).toBe('pick_gold');
    expect(c.fields['tools.rod.id']).toBe('rod_fiberglass');
    expect(c.fields['business.tier']).toBe('stand');
    expect(c.fields['business.workers']).toBe(10);
    expect(c.fields['business.manager']).toBe(true);
    expect(c.wagesPaid).toBe(2_000 + 18 * 500 * 2);
  });

  it('backdates the join date only for active players', () => {
    expect((convert(readLegacy(v2('1', '2021-03-01', { commands_cooldowns: commands(3) })), NOW).fields.createdAt as Date).getUTCFullYear()).toBe(2021);
    expect(convert(readLegacy(v2('1', '2021-03-01', {})), NOW).fields.createdAt).toEqual(NOW);
    expect(isActive(readLegacy(v2('1', '2021-03-01', {})))).toBe(false);
  });

  it('converts guild settings, treating "0" as unset', () => {
    expect(convertGuild({ guildID: '333333333333333333', welcomeID: '0', InviteLinks: 0 }).fields).toEqual({});
    const g = convertGuild(
      { guildID: '333333333333333333', welcomeID: '444444444444444444', InviteLinks: 1, ticket: { roleID: '555555555555555555', number: 12 } },
      { GuildID: '333333333333333333', RoleID: '666666666666666666' },
    );
    expect(g.fields).toEqual({
      'welcome.channelId': '444444444444444444', 'automod.inviteFilter': true, autoRoleId: '666666666666666666',
      'tickets.staffRoleId': '555555555555555555', 'tickets.counter': 12,
    });
  });
});

describe('v2 migration (database)', () => {
  useTestDatabase();
  const legacy = () => mongoose.connection.db!.collection('profilemodels');
  const ACTIVE = '700000000000000001';
  const FOUNDER = '700000000000000002';
  const DORMANT = '700000000000000003';
  const DUP = '700000000000000004';

  beforeEach(async () => {
    const db = mongoose.connection.db!;
    for (const c of ['profilemodels', 'guilds', 'autoroles']) await db.collection(c).deleteMany({});
    await legacy().insertMany([
      v2(ACTIVE, '2021-09-01', { coins: 1.49e57, bank: 3_000, commands_cooldowns: commands(3), Items: { CommonFish: 2 } }),
      v2(FOUNDER, '2021-02-01', { coins: 20_000, level: 3, xp: 40, commands_cooldowns: commands(6), Company: { workers: 2, lastCollected: new Date(NOW.getTime() - 3_600_000) } }),
      v2(DORMANT, '2022-01-01', { coins: 1_500 }),
      v2(DUP, '2021-10-01', { coins: 100, commands_cooldowns: commands(2) }),
      v2(DUP, '2022-03-01', { coins: 7_000, commands_cooldowns: commands(1) }),
    ]);
    await db.collection('guilds').insertMany([
      { guildID: '800000000000000001', welcomeID: '800000000000000009', InviteLinks: 1 },
      { guildID: '800000000000000002', welcomeID: '0', InviteLinks: 0 },
    ]);
    await db.collection('autoroles').insertOne({ guildId: '800000000000000002', roleId: '800000000000000008' });
  });

  async function snapshot(): Promise<Record<string, string>> {
    const db = mongoose.connection.db!;
    const out: Record<string, string> = {};
    for (const { name } of await db.listCollections().toArray()) {
      const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      out[name] = createHash('sha256').update(JSON.stringify(docs)).digest('hex');
    }
    return out;
  }

  it('dry run reports everything and writes nothing', async () => {
    const before = await snapshot();
    const s = await runMigration({ dryRun: true, now: NOW });
    expect(await snapshot()).toEqual(before);
    expect(s.profiles).toMatchObject({ docs: 5, users: 4, duplicates: 1, active: 3, dormant: 1, corrupt: 1, imported: 3 });
    expect(s.profiles.tiers).toEqual({ veteran: 2, elite: 0, founder: 1 });
    expect(s.guilds).toMatchObject({ docs: 2, withSettings: 2, created: 2, autorolesMatched: 1 });
  });

  it('imports active players up front, once, and leaves v2 untouched', async () => {
    const v2Before = await legacy().find({}).sort({ _id: 1 }).toArray();
    const first = await runMigration({ dryRun: false, now: NOW });
    expect(first.profiles.imported).toBe(3);
    expect(await User.countDocuments()).toBe(3);
    expect(await User.exists({ _id: DORMANT })).toBeNull();

    const founder = await User.findById(FOUNDER).lean();
    expect(founder?.veteran?.tier).toBe('founder');
    expect(founder?.cosmetics?.owned).toContain('title_founder');
    expect(founder?.createdAt?.toISOString().slice(0, 10)).toBe('2021-02-01');
    expect(founder?.account?.best).toBe(founder?.account?.level);
    expect(founder?.business?.workers).toBe(2);
    expect(founder?.board?.netWorth).toBe((founder?.wallet ?? 0) + (founder?.bank ?? 0));
    expect(founder?.job?.current).toBe('barista'); // schema defaults still filled in
    expect(founder?.migratedFromV2).toBe(true);

    const active = await User.findById(ACTIVE).lean();
    expect(active?.wallet).toBe(ceiling);
    expect(active?.inventory).toEqual({ fish_perch: 2 });

    expect((await User.findById(DUP).lean())?.wallet).toBe(100); // the more active doc, not the sum

    const rows = await Transaction.find({ userId: FOUNDER }).lean();
    expect(rows.every((r) => r.source === MIGRATION_SOURCE)).toBe(true);
    expect(rows.reduce((n, r) => n + r.delta, 0)).toBe((founder?.wallet ?? 0) + (founder?.bank ?? 0));

    expect(await GuildSettings.findById('800000000000000001').lean()).toMatchObject({ welcome: { channelId: '800000000000000009' }, automod: { inviteFilter: true } });
    expect((await GuildSettings.findById('800000000000000002').lean())?.autoRoleId).toBe('800000000000000008');

    const players = await snapshot();
    const second = await runMigration({ dryRun: false, now: NOW });
    expect(await snapshot()).toEqual(players); // a second run changes nothing at all
    expect(second.profiles.imported).toBe(0);
    expect(second.profiles.alreadyImported).toBe(3);
    expect(second.guilds.created).toBe(0);
    expect(await legacy().find({}).sort({ _id: 1 }).toArray()).toEqual(v2Before);
  });

  it('gives a tier to a veteran whose v3 profile already existed, without touching balances', async () => {
    await User.create({ _id: FOUNDER, wallet: 42 });
    const s = await runMigration({ dryRun: false, now: NOW });
    expect(s.profiles.tierGrantedToExisting).toBe(1);
    const u = await User.findById(FOUNDER).lean();
    expect(u?.wallet).toBe(42);
    expect(u?.veteran?.tier).toBe('founder');
    expect(u?.migratedFromV2).toBe(false);
  });

  it('imports dormant players on demand as fresh accounts', async () => {
    const { profile, created } = await loadProfileDetailed(DORMANT);
    expect(created).toBe(true);
    expect(profile.wallet).toBe(1_500);
    expect(profile.migratedFromV2).toBe(true);
    expect(profile.veteran?.tier).toBeNull();
    expect(Date.now() - new Date(profile.createdAt!).getTime()).toBeLessThan(60_000); // not backdated: anti-alt still applies
    expect((await loadProfileDetailed(DORMANT)).created).toBe(false);
  });

  it('never imports twice under concurrent lookups, and keeps coins paid mid-import', async () => {
    await Promise.all([
      loadProfile(DORMANT), loadProfile(DORMANT), ensureUser(DORMANT), getProfile(DORMANT),
      apply(DORMANT, { wallet: 250 }, { source: 'test' }), loadProfile(DORMANT),
    ]);
    const u = await User.findById(DORMANT).lean();
    expect(u?.wallet).toBe(1_500 + 250);
    expect(await Transaction.countDocuments({ userId: DORMANT, source: MIGRATION_SOURCE })).toBe(1);
  });

  it('creates plain profiles for people who never played v2', async () => {
    const { profile, created } = await loadProfileDetailed('900000000000000001');
    expect(created).toBe(true);
    expect(profile.wallet).toBe(economyConfig.startingWallet);
    expect(profile.migratedFromV2).toBe(false);
  });
});

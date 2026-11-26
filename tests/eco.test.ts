import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { Transaction } from '../src/models/Transaction';
import { User } from '../src/models/User';
import { EconomySnapshot } from '../src/models/EconomySnapshot';
import { coinFlows, dailyFlows, dayNumber, moneySupply, snapshotSupply } from '../src/services/ecoStats';
import { ecoGive, ecoReset, ecoTake } from '../src/services/ecoAdmin';
import { apply } from '../src/services/economy';
import { grantVeteran } from '../src/services/veteran';
import { MIGRATION_SOURCE } from '../src/migration/v2';

useTestDatabase();

const row = (source: string, delta: number, extra: Record<string, unknown> = {}) => ({ userId: '1', kind: 'wallet', source, delta, ...extra });

describe('/eco stats', () => {
  it('counts created vs destroyed coins, netting bets, transfers, bank moves and v2 imports out', async () => {
    await Transaction.insertMany([
      row('work', 500),
      row('daily', 300),
      row('gamble.slots.bet', -100), row('gamble.slots.payout', 90), // house edge 10
      row('give', -1_000, { transfer: true }), row('give', 1_000, { transfer: true, userId: '2' }), row('give.tax', -50),
      row('bank.deposit', -400), row('bank.deposit', 400, { kind: 'bank' }),
      row('tools.repair.pickaxe', -200),
      row(MIGRATION_SOURCE, 500_000),
      row('fish', 10, { kind: 'item', itemId: 'fish_perch' }), // items aren't coins
      row('work', 9_999, { at: new Date(Date.now() - 10 * 86_400_000) }), // outside the window
    ]);
    const f = await coinFlows(new Date(Date.now() - 7 * 86_400_000));
    expect(f.created).toBe(800);
    expect(f.destroyed).toBe(260);
    expect(f.net).toBe(540);
    expect(Object.fromEntries(f.bySource.map((s) => [s.source, s.net]))).toEqual({ work: 500, daily: 300, tools: -200, give: -50, gamble: -10 });
  });

  it('splits flows by UTC day, including empty days', async () => {
    const now = new Date('2026-12-10T12:00:00Z');
    await Transaction.insertMany([
      row('work', 100, { at: new Date('2026-12-10T01:00:00Z') }),
      row('work', 50, { at: new Date('2026-12-08T23:00:00Z') }),
      row('prestige', -70, { at: new Date('2026-12-08T10:00:00Z') }),
    ]);
    const days = await dailyFlows(3, now);
    expect(days.map((d) => [d.created, d.destroyed])).toEqual([[50, 70], [0, 0], [100, 0]]);
    expect(days[2]!.day).toBe(dayNumber(now));
  });

  it('records the money supply once per day', async () => {
    await User.create([{ _id: 'a', wallet: 100, bank: 50 }, { _id: 'b', wallet: 1, bank: 0 }]);
    expect(await moneySupply()).toEqual({ wallet: 101, bank: 50, players: 2 });
    const now = new Date('2026-12-10T00:01:00Z');
    await snapshotSupply(now);
    await User.updateOne({ _id: 'a' }, { $inc: { wallet: 1_000 } });
    await snapshotSupply(now);
    expect(await EconomySnapshot.findById(dayNumber(now)).lean()).toMatchObject({ wallet: 101, bank: 50, players: 2 });
  });
});

describe('/eco owner tools', () => {
  it('gives and takes through the economy service, logged as eco.*', async () => {
    await ecoGive('u', 'owner', 5_000, { id: 'fish_perch', qty: 3 });
    await ecoTake('u', 'owner', 2_000, 'wallet', { id: 'fish_perch', qty: 1 });
    await expect(ecoTake('u', 'owner', 1, 'bank')).rejects.toThrow();
    const u = await User.findById('u').lean();
    expect(u?.wallet).toBe(1_000 + 3_000);
    expect(u?.inventory).toEqual({ fish_perch: 2 });
    expect(new Set((await Transaction.find({ userId: 'u' }).lean()).map((r) => r.source))).toEqual(new Set(['eco.give', 'eco.take']));
  });

  it('resets a profile but keeps the join date and veteran cosmetics', async () => {
    await apply('v', { wallet: 9_000, set: { 'account.level': 12, 'account.xp': 50_000 } }, { source: 'test' });
    await grantVeteran('v', 'elite');
    const joined = new Date('2021-04-01T00:00:00Z');
    await User.collection.updateOne({ _id: 'v' as never }, { $set: { createdAt: joined, migratedFromV2: true } }); // raw: createdAt is immutable in Mongoose
    await User.updateOne({ _id: 'v' }, { $addToSet: { 'cosmetics.owned': 'theme_ocean' } });

    const removed = await ecoReset('v', 'owner');
    expect(removed.wallet).toBe(10_000);
    const u = await User.findById('v').lean();
    expect(u?.wallet).toBe(1_000);
    expect(u?.account?.level).toBe(0);
    expect(u?.createdAt?.toISOString()).toBe(joined.toISOString());
    expect(u?.migratedFromV2).toBe(true);
    expect(u?.veteran?.tier).toBe('elite');
    expect(u?.cosmetics?.owned).toContain('title_elite_veteran');
    expect(u?.cosmetics?.owned).not.toContain('theme_ocean');
    expect(await Transaction.countDocuments({ userId: 'v', source: 'eco.reset' })).toBe(1);
  });
});

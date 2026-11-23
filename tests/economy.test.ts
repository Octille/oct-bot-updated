import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { Transaction } from '../src/models/Transaction';
import * as eco from '../src/services/economy';
import { EconomyError } from '../src/lib/errors';
import { bankCapacity, economyConfig } from '../src/content/economy';

useTestDatabase();

const balance = async (id: string) => {
  const u = await User.findById(id).lean();
  return { wallet: u!.wallet, bank: u!.bank, inventory: u!.inventory ?? {} };
};

describe('profiles', () => {
  it('creates a profile with the starting wallet on first use', async () => {
    const p = await eco.loadProfile('u1');
    expect(p.wallet).toBe(economyConfig.startingWallet);
    expect(p.bank).toBe(0);
  });

  it('concurrent first use creates exactly one profile', async () => {
    await Promise.all(Array.from({ length: 20 }, () => eco.loadProfile('race')));
    expect(await User.countDocuments({ _id: 'race' })).toBe(1);
  });
});

describe('apply', () => {
  it('adds and removes coins and logs each change', async () => {
    await eco.addCoins('u1', 500, { source: 'test.add' });
    await eco.removeCoins('u1', 200, { source: 'test.remove' });
    expect((await balance('u1')).wallet).toBe(economyConfig.startingWallet + 300);

    const rows = await Transaction.find({ userId: 'u1' }).sort({ at: 1 }).lean();
    expect(rows.map((r) => [r.source, r.delta])).toEqual([['test.add', 500], ['test.remove', -200]]);
  });

  it('refuses to overspend and changes nothing', async () => {
    await eco.loadProfile('u1');
    await expect(eco.removeCoins('u1', 5_000, { source: 'test' })).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET' });
    expect((await balance('u1')).wallet).toBe(economyConfig.startingWallet);
    expect(await Transaction.countDocuments()).toBe(0);
  });

  it('rejects fractional and invalid amounts', async () => {
    await expect(eco.addCoins('u1', 1.5, { source: 'test' })).rejects.toBeInstanceOf(EconomyError);
    await expect(eco.addCoins('u1', 0, { source: 'test' })).rejects.toBeInstanceOf(EconomyError);
    await expect(eco.addCoins('u1', Number.NaN, { source: 'test' })).rejects.toBeInstanceOf(EconomyError);
  });

  it('50 concurrent spends can never overspend', async () => {
    await eco.loadProfile('spender'); // 1,000 coins
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => eco.removeCoins('spender', 100, { source: 'test.spam' })),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBe(10);
    expect((await balance('spender')).wallet).toBe(0);
    expect(await Transaction.countDocuments({ userId: 'spender' })).toBe(10);
  });

  it('buys an item atomically (coins and item in one update)', async () => {
    await eco.apply('u1', { wallet: -250, items: { fishing_rod: 1 } }, { source: 'shop.buy' });
    const b = await balance('u1');
    expect(b.wallet).toBe(750);
    expect(b.inventory).toEqual({ fishing_rod: 1 });
  });

  it('a purchase the user cannot afford gives no item', async () => {
    await expect(eco.apply('u1', { wallet: -5_000, items: { fishing_rod: 1 } }, { source: 'shop.buy' }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET' });
    expect((await balance('u1')).inventory).toEqual({});
  });

  it('removes items only when owned, and clears items that hit zero', async () => {
    await eco.addItem('u1', 'cod', 3, { source: 'fish' });
    await expect(eco.removeItem('u1', 'cod', 4, { source: 'sell' })).rejects.toMatchObject({ code: 'INSUFFICIENT_ITEMS' });
    await eco.removeItem('u1', 'cod', 3, { source: 'sell' });
    expect((await balance('u1')).inventory).toEqual({});
  });

  it('rejects malformed item ids', async () => {
    await expect(eco.addItem('u1', 'bad.id', 1, { source: 'test' })).rejects.toThrow();
    await expect(eco.addItem('u1', '$where', 1, { source: 'test' })).rejects.toThrow();
  });
});

describe('bank', () => {
  it('deposits and withdraws, logged as internal moves', async () => {
    await eco.loadProfile('u1');
    const dep = await eco.deposit('u1', 600);
    expect(dep.amount).toBe(600);
    expect(await balance('u1')).toMatchObject({ wallet: 400, bank: 600 });
    const wd = await eco.withdraw('u1', 'all');
    expect(wd.amount).toBe(600);
    expect(await balance('u1')).toMatchObject({ wallet: 1_000, bank: 0 });
    expect(await Transaction.countDocuments({ transfer: false })).toBe(0);
  });

  it('never fills the bank past its capacity', async () => {
    const cap = bankCapacity(0, 0);
    await eco.addCoins('rich', cap * 2, { source: 'test' });
    await expect(eco.deposit('rich', cap + 1)).rejects.toMatchObject({ code: 'BANK_FULL' });

    const { amount } = await eco.deposit('rich', 'all');
    expect(amount).toBe(cap);
    expect((await balance('rich')).bank).toBe(cap);
    await expect(eco.deposit('rich', 'all')).rejects.toMatchObject({ code: 'BANK_FULL' });
  });

  it('capacity grows with account level and bank notes', async () => {
    await eco.loadProfile('lvl');
    await User.updateOne({ _id: 'lvl' }, { $set: { 'account.level': 10, bankNotes: 2 } });
    const cap = bankCapacity(10, 2);
    await eco.addCoins('lvl', cap, { source: 'test' });
    const { amount } = await eco.deposit('lvl', 'all');
    expect(amount).toBe(cap);
  });

  it('concurrent deposits cannot exceed capacity', async () => {
    const cap = bankCapacity(0, 0);
    await eco.addCoins('race', cap, { source: 'test' });
    const chunk = Math.ceil(cap / 4);
    await Promise.allSettled(Array.from({ length: 10 }, () => eco.deposit('race', chunk)));
    const b = await balance('race');
    expect(b.bank).toBeLessThanOrEqual(cap);
    expect(b.wallet + b.bank).toBe(cap + economyConfig.startingWallet);
  });
});

describe('transfer', () => {
  it('moves coins between players, destroying the tax', async () => {
    await eco.loadProfile('a');
    await eco.loadProfile('b');
    const result = await eco.transfer('a', 'b', 1_000, { source: 'give', taxRate: 0.05 });
    expect(result).toEqual({ sent: 1_000, received: 950, tax: 50 });
    expect((await balance('a')).wallet).toBe(0);
    expect((await balance('b')).wallet).toBe(1_950);

    const created = await Transaction.aggregate([{ $match: { transfer: false } }, { $group: { _id: null, sum: { $sum: '$delta' } } }]);
    expect(created[0].sum).toBe(-50); // only the tax left the economy
  });

  it('a failed transfer changes neither side and logs nothing', async () => {
    await eco.loadProfile('a');
    await eco.loadProfile('b');
    await expect(eco.transfer('a', 'b', 5_000, { source: 'give' })).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET' });
    expect((await balance('a')).wallet).toBe(1_000);
    expect((await balance('b')).wallet).toBe(1_000);
    expect(await Transaction.countDocuments()).toBe(0);
  });

  it('refuses self transfers', async () => {
    await expect(eco.transfer('a', 'a', 10, { source: 'give' })).rejects.toMatchObject({ code: 'SELF_TRANSFER' });
  });

  it('concurrent transfers conserve the total and never go negative', async () => {
    await eco.loadProfile('a');
    await eco.loadProfile('b');
    await Promise.allSettled([
      ...Array.from({ length: 15 }, () => eco.transfer('a', 'b', 100, { source: 'give' })),
      ...Array.from({ length: 15 }, () => eco.transfer('b', 'a', 100, { source: 'give' })),
    ]);
    const a = await balance('a');
    const b = await balance('b');
    expect(a.wallet).toBeGreaterThanOrEqual(0);
    expect(b.wallet).toBeGreaterThanOrEqual(0);
    expect(a.wallet + b.wallet).toBe(2_000);
  });
});

describe('settle', () => {
  it('applies a multi-player swap all-or-nothing', async () => {
    await eco.addItem('a', 'gem', 1, { source: 'test' });
    await eco.loadProfile('b');

    // b can't afford 5,000, so a must keep the gem
    await expect(eco.settle([
      { userId: 'a', change: { wallet: 5_000, items: { gem: -1 } }, transfer: true },
      { userId: 'b', change: { wallet: -5_000, items: { gem: 1 } }, transfer: true },
    ], { source: 'trade' })).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET' });
    expect((await balance('a')).inventory).toEqual({ gem: 1 });
    expect((await balance('b')).inventory).toEqual({});

    await eco.settle([
      { userId: 'a', change: { wallet: 500, items: { gem: -1 } }, transfer: true },
      { userId: 'b', change: { wallet: -500, items: { gem: 1 } }, transfer: true },
    ], { source: 'trade' });
    expect(await balance('a')).toMatchObject({ wallet: 1_500, inventory: {} });
    expect(await balance('b')).toMatchObject({ wallet: 500, inventory: { gem: 1 } });
  });
});

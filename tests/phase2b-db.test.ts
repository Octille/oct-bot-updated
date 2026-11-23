import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import * as eco from '../src/services/economy';
import { boughtToday, buy, getRotation } from '../src/services/shop';
import { dayNumber } from '../src/game/streaks';
import { selectForSale, sell, useItem } from '../src/services/items';
import { bailCost, payBail } from '../src/services/jail';
import { grant } from '../src/services/progression';
import { totalXpForLevel } from '../src/content/levels';
import { basics } from '../src/content/shop';
import { bankCapacity } from '../src/content/economy';

useTestDatabase();

const user = (id: string) => User.findById(id).lean();

describe('shop', () => {
  it('buys basics atomically', async () => {
    await eco.addCoins('u1', 20_000, { source: 'test' });
    const p = await buy('u1', 'crate_common', 2);
    expect(p.total).toBe(basics.find((b) => b.id === 'crate_common')!.price * 2);
    expect((await user('u1'))!.inventory).toMatchObject({ crate_common: 2 });
  });

  it('cosmetics can only be bought once', async () => {
    await eco.addCoins('u1', 200_000, { source: 'test' });
    await buy('u1', 'theme_ocean', 1);
    await expect(buy('u1', 'theme_ocean', 1)).rejects.toThrow(/already own/);
    expect((await user('u1'))!.cosmetics?.owned).toEqual(['theme_ocean']);
  });

  it('rotation limits are per player: each player gets their own daily allowance', async () => {
    const { stock } = getRotation();
    const slot = stock.find((s) => s.kind === 'item') ?? stock[0]!;
    for (const id of ['a', 'b']) await eco.addCoins(id, slot.price * (slot.limit + 2), { source: 'test' });

    for (let n = 0; n < slot.limit; n++) await buy('a', slot.id, 1);
    await expect(buy('a', slot.id, 1)).rejects.toThrow(/per day/);
    // Another player is unaffected
    await buy('b', slot.id, 1);
    const a = (await user('a'))!;
    expect(boughtToday(a as never, slot.id, dayNumber(new Date()))).toBe(slot.limit);
    // The refused purchase charged nothing
    expect(a.wallet).toBe(1_000 + slot.price * (slot.limit + 2) - slot.price * slot.limit);
  });

  it('double-clicking can never exceed the limit', async () => {
    const { stock } = getRotation();
    const slot = stock[0]!;
    await eco.addCoins('x', slot.price * 10, { source: 'test' });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => buy('x', slot.id, 1)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(slot.limit);
  });

  it("yesterday's purchases don't count today", async () => {
    const { stock, day } = getRotation();
    const slot = stock[0]!;
    await eco.addCoins('y', slot.price * 2, { source: 'test' });
    await User.updateOne({ _id: 'y' }, { $set: { rotation: { day: day - 1, bought: { [slot.id]: 99 } } } });
    if (slot.kind === 'item') {
      await buy('y', slot.id, 1);
      expect(boughtToday((await user('y'))! as never, slot.id, day)).toBe(1);
    } else {
      await buy('y', slot.id, 1);
      expect((await user('y'))!.cosmetics?.owned).toContain(slot.id);
    }
  });
});

describe('items', () => {
  it('opens a crate: the crate is gone and the loot arrives', async () => {
    await eco.addItem('u1', 'crate_rare', 1, { source: 'test' });
    const r = await useItem('u1', 'crate_rare', 1);
    if (r.kind !== 'crate') throw new Error('expected crate');
    const u = (await user('u1'))!;
    expect(u.inventory?.crate_rare).toBeUndefined();
    expect(u.wallet).toBe(1_000 + r.loot.coins);
    expect(u.stats?.cratesOpened).toBe(1);
  });

  it('boosts stack time; bank notes raise capacity; streak freezes are passive', async () => {
    await eco.addItem('u1', 'xp_boost', 2, { source: 'test' });
    const r = await useItem('u1', 'xp_boost', 2);
    if (r.kind !== 'boost') throw new Error('expected boost');
    expect(r.until.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);

    await eco.addItem('u1', 'bank_note', 1, { source: 'test' });
    await useItem('u1', 'bank_note', 1);
    const cap = eco.capacityOf((await user('u1'))! as never);
    expect(cap).toBe(bankCapacity(0, 1));

    await eco.addItem('u1', 'streak_freeze', 1, { source: 'test' });
    await expect(useItem('u1', 'streak_freeze', 1)).rejects.toThrow(/automatically/);
  });

  it('XP boost doubles account XP', async () => {
    const plain = await grant('a', {}, { source: 't', xp: 'daily' });
    await User.updateOne({ _id: 'b' }, { $set: { 'boosts.xp': new Date(Date.now() + 60_000) } }, { upsert: true });
    const boosted = await grant('b', {}, { source: 't', xp: 'daily', profile: (await user('b'))! as never });
    expect(boosted.xp).toBe(plain.xp * 2);
  });

  it('can\'t use what you don\'t have', async () => {
    await eco.loadProfile('u1');
    await expect(useItem('u1', 'crate_epic', 1)).rejects.toThrow(/only have 0/);
  });

  it('bulk sells exactly the selected stacks, not consumables', async () => {
    await eco.apply('u1', { items: { fish_carp: 3, gem_ruby: 1, xp_boost: 1 } }, { source: 'test' });
    const inv = (await user('u1'))!.inventory as Record<string, number>;
    const selected = selectForSale(inv, { everything: true });
    expect(selected).toEqual({ fish_carp: 3, gem_ruby: 1 });
    const sale = await sell('u1', selected);
    expect(sale.total).toBeGreaterThan(0);
    expect((await user('u1'))!.inventory).toEqual({ xp_boost: 1 });
    await expect(sell('u1', selected)).rejects.toMatchObject({ code: 'INSUFFICIENT_ITEMS' });
  });
});

describe('jail', () => {
  it('bail costs per remaining minute and frees you', async () => {
    const until = new Date(Date.now() + 4.5 * 60_000);
    expect(bailCost(until)).toBe(5 * 400);
    await eco.addCoins('u1', 10_000, { source: 'test' });
    await User.updateOne({ _id: 'u1' }, { $set: { jailUntil: until } });
    expect(await payBail('u1')).toBe(2_000);
    expect((await user('u1'))!.jailUntil).toBeNull();
    await expect(payBail('u1')).rejects.toThrow(/not in jail/);
  });
});

describe('level crates', () => {
  it('reaching level 5 gives one rare crate, even with racing grants', async () => {
    await eco.loadProfile('u1');
    await User.updateOne({ _id: 'u1' }, { $set: { 'account.xp': totalXpForLevel(5) - 1 } });
    const results = await Promise.all(Array.from({ length: 6 }, () => grant('u1', {}, { source: 't', xp: 'beg' })));
    expect(results.filter((r) => r.levelUp)).toHaveLength(1);
    expect((await user('u1'))!.inventory).toEqual({ crate_rare: 1 });
  });
});

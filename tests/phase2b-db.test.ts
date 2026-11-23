import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { ShopRotation } from '../src/models/ShopRotation';
import * as eco from '../src/services/economy';
import { buy, getRotation } from '../src/services/shop';
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

  it('rotation stock is shared, limited, and one per player per day', async () => {
    const { day, stock } = await getRotation();
    const slot = stock[0]!;
    await ShopRotation.updateOne({ _id: day }, { $set: { 'stock.0.remaining': 2 } });
    for (const id of ['a', 'b', 'c']) await eco.addCoins(id, slot.price * 3, { source: 'test' });

    await buy('a', slot.id, 1);
    await expect(buy('a', slot.id, 1)).rejects.toThrow(slot.kind === 'cosmetic' ? /already own/ : /only buy 1/);
    await buy('b', slot.id, 1);
    await expect(buy('c', slot.id, 1)).rejects.toThrow(/sold out/);
    expect((await ShopRotation.findById(day).lean())!.stock[0]!.remaining).toBe(0);
    // c was not charged
    expect((await user('c'))!.wallet).toBe(1_000 + slot.price * 3);
  });

  it('two players racing for the last rotation item: exactly one gets it', async () => {
    const { day, stock } = await getRotation();
    const slot = stock[1]!;
    await ShopRotation.updateOne({ _id: day }, { $set: { 'stock.1.remaining': 1 } });
    for (const id of ['x', 'y', 'z']) await eco.addCoins(id, slot.price, { source: 'test' });
    const results = await Promise.allSettled(['x', 'y', 'z'].map((id) => buy(id, slot.id, 1)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
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

import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import * as eco from '../src/services/economy';
import { grant, syncLevel, unlocksBetween } from '../src/services/progression';
import { ensureStarterRod, repair, upgrade } from '../src/services/tools';
import { totalXpForLevel } from '../src/content/levels';
import { pickaxes } from '../src/content/tools';

useTestDatabase();

describe('grant', () => {
  it('pays coins, items and stats with XP in one update', async () => {
    const { profile, xp } = await grant('u1', { wallet: 300, items: { fish_carp: 1 }, inc: { 'stats.fishCaught': 1 } }, { source: 'fish', xp: 'fish' });
    expect(profile.wallet).toBe(1_300);
    expect(profile.inventory).toEqual({ fish_carp: 1 });
    expect(profile.stats?.fishCaught).toBe(1);
    expect(profile.account?.xp).toBe(xp);
    expect(xp).toBeGreaterThan(0);
  });

  it('levels up once, even when grants race', async () => {
    await eco.loadProfile('u1');
    await User.updateOne({ _id: 'u1' }, { $set: { 'account.xp': totalXpForLevel(5) - 1 } });
    const results = await Promise.all(Array.from({ length: 10 }, () => grant('u1', { inc: { 'stats.begged': 1 } }, { source: 'beg', xp: 'beg' })));
    const levelUps = results.filter((r) => r.levelUp);
    expect(levelUps).toHaveLength(1);
    expect(levelUps[0]!.levelUp).toMatchObject({ from: 0, to: 5 });
    expect((await User.findById('u1').lean())!.account!.level).toBe(5);
  });

  it('lists what a level-up unlocks', () => {
    expect(unlocksBetween(4, 5).join(' ')).toMatch(/Coder/);
    expect(unlocksBetween(0, 1)).toEqual([]);
  });

  it('syncLevel is a no-op when already in sync', async () => {
    const p = await eco.loadProfile('u2');
    expect(await syncLevel(p)).toBeNull();
  });
});

describe('tools', () => {
  it('gives the starter rod exactly once', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureStarterRod('u1')));
    expect(results.every((p) => p.tools?.rod?.id === 'rod_old')).toBe(true);
  });

  it('upgrades in order, charging the price, and a double-click buys only one', async () => {
    await eco.addCoins('u1', 50_000, { source: 'test' });
    const settled = await Promise.allSettled([upgrade('u1', 'pickaxe'), upgrade('u1', 'pickaxe')]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const u = (await User.findById('u1').lean())!;
    expect(u.tools?.pickaxe?.id).toBe('pick_wood');
    expect(u.wallet).toBe(51_000 - pickaxes[0]!.cost);
  });

  it('respects level requirements and affordability', async () => {
    await eco.addCoins('u1', 10_000_000, { source: 'test' });
    await upgrade('u1', 'pickaxe'); // wood
    await upgrade('u1', 'pickaxe'); // stone
    await expect(upgrade('u1', 'pickaxe')).rejects.toThrow(/level/); // iron needs level 3
    await eco.loadProfile('poor');
    await expect(upgrade('poor', 'pickaxe')).rejects.toMatchObject({ code: 'INSUFFICIENT_WALLET' });
  });

  it('repairs to full and refuses when already full', async () => {
    await eco.addCoins('u1', 10_000, { source: 'test' });
    await upgrade('u1', 'pickaxe');
    await expect(repair('u1', 'pickaxe')).rejects.toThrow(/perfect shape/);
    await User.updateOne({ _id: 'u1' }, { $set: { 'tools.pickaxe.durability': 10 } });
    const { cost } = await repair('u1', 'pickaxe');
    expect(cost).toBeGreaterThan(0);
    expect((await User.findById('u1').lean())!.tools?.pickaxe?.durability).toBe(pickaxes[0]!.durability);
  });
});

describe('apply guards', () => {
  it('refuses inc/set paths that would bypass the wallet guard', async () => {
    await expect(eco.apply('u1', { inc: { wallet: 1_000_000 } }, { source: 'hack' })).rejects.toThrow(/Unsafe/);
    await expect(eco.apply('u1', { set: { 'inventory.gem': 5 } }, { source: 'hack' })).rejects.toThrow(/Unsafe/);
    await expect(eco.apply('u1', { set: { $where: 1 } as never }, { source: 'hack' })).rejects.toThrow(/Unsafe/);
  });

  it('where conditions make an update conditional', async () => {
    await eco.loadProfile('u1');
    await expect(eco.apply('u1', { wallet: 10, where: { 'job.current': 'ceo' } }, { source: 't' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

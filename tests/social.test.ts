import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { RobEscrow } from '../src/models/RobEscrow';
import { totalXpForLevel } from '../src/content/levels';
import { heistRules, robRules } from '../src/content/social';
import { attemptRob, catchRobber, payEscrow, sweepEscrows } from '../src/services/rob';
import { runHeist } from '../src/services/heist';
import { giftItem, giveCoins, settleTrade } from '../src/services/trade';
import { getProfile } from '../src/services/economy';

const lvl = (n: number) => ({ xp: totalXpForLevel(n), level: n, best: n });
const always = (v: number) => ({ next: () => v });
/** Profiles in these tests are made "old" so the 3-day profile rule doesn't get in the way. */
const age = () => User.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
const wallets = async (...ids: string[]) => Promise.all(ids.map(async (id) => (await getProfile(id)).wallet));

describe('social (database)', () => {
  useTestDatabase();

  it("can't rob someone who never played, and doesn't create a profile for them", async () => {
    await User.create({ _id: 'r1', wallet: 10_000, account: lvl(10) });
    await age();
    await expect(attemptRob('r1', 'ghost', always(0))).rejects.toThrow(/haven't played/);
    expect(await User.exists({ _id: 'ghost' })).toBeNull();
  });

  it('a successful rob holds the loot; payout and catch race resolve exactly once', async () => {
    await User.create({ _id: 'r2', wallet: 10_000, account: lvl(10) });
    await User.create({ _id: 'v2', wallet: 40_000, account: lvl(10) });
    await age();
    const out = await attemptRob('r2', 'v2', always(0));
    expect(out.kind).toBe('success');
    if (out.kind !== 'success') return;
    expect(out.amount).toBe(Math.floor(40_000 * robRules.steal[0]));
    expect(await wallets('r2', 'v2')).toEqual([10_000, 40_000 - out.amount]);
    const [paid, caught] = await Promise.all([payEscrow(out.escrowId), catchRobber(out.escrowId, 'v2', new Date())]);
    expect([paid, caught].filter(Boolean).length).toBe(1);
    const [r, v] = await wallets('r2', 'v2');
    expect(r! + v!).toBe(50_000); // coins only moved between them
    expect((await RobEscrow.findById(out.escrowId).lean())?.status).toMatch(/paid|caught/);
  });

  it('catching after the deadline does nothing; the sweep pays the robber', async () => {
    await User.create({ _id: 'r3', wallet: 10_000, account: lvl(10) });
    await User.create({ _id: 'v3', wallet: 20_000, account: lvl(10) });
    await age();
    const out = await attemptRob('r3', 'v3', always(0));
    if (out.kind !== 'success') throw new Error('expected success');
    expect(await catchRobber(out.escrowId, 'v3', new Date(out.deadline.getTime() + 1))).toBeNull();
    expect((await sweepEscrows(new Date(out.deadline.getTime() + 5_000))).length).toBe(1);
    expect(await wallets('r3', 'v3')).toEqual([10_000 + out.amount, 20_000 - out.amount]);
  });

  it('a caught robber returns the loot, pays a fine to the victim and goes to jail', async () => {
    await User.create({ _id: 'r4', wallet: 10_000, account: lvl(10) });
    await User.create({ _id: 'v4', wallet: 20_000, account: lvl(10) });
    await age();
    const out = await attemptRob('r4', 'v4', always(0));
    if (out.kind !== 'success') throw new Error('expected success');
    const c = await catchRobber(out.escrowId, 'v4', new Date());
    expect(c?.fine).toBe(1_000);
    expect(await wallets('r4', 'v4')).toEqual([9_000, 21_000]);
    expect((await getProfile('r4')).jailUntil).toBeTruthy();
  });

  it('a failed rob fines the robber (paid to the victim); the victim is then protected', async () => {
    await User.create({ _id: 'r5', wallet: 20_000, account: lvl(10) });
    await User.create({ _id: 'r5b', wallet: 20_000, account: lvl(10) });
    await User.create({ _id: 'v5', wallet: 20_000, account: lvl(10) });
    await age();
    const out = await attemptRob('r5', 'v5', always(0.99));
    expect(out).toMatchObject({ kind: 'failed', fine: 2_000, jailMinutes: null });
    expect(await wallets('r5', 'v5')).toEqual([18_000, 22_000]);
    await expect(attemptRob('r5b', 'v5', always(0))).rejects.toThrow(/robbed recently/);
  });

  it('a padlock blocks one robbery and is used up once', async () => {
    await User.create({ _id: 'r6', wallet: 10_000, account: lvl(10) });
    await User.create({ _id: 'r6b', wallet: 10_000, account: lvl(10) });
    await User.create({ _id: 'v6', wallet: 20_000, account: lvl(10), inventory: { padlock: 1 } });
    await age();
    const results = await Promise.allSettled([attemptRob('r6', 'v6', always(0)), attemptRob('r6b', 'v6', always(0))]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ kind: string }>).value.kind);
    expect(ok).toEqual(['padlock']);
    expect(((await getProfile('v6')).inventory as Record<string, number>).padlock ?? 0).toBe(0);
  });

  it('heist: drops members who can\'t pay, takes stakes once and pays the crew', async () => {
    for (const id of ['h1', 'h2', 'h3']) await User.create({ _id: id, wallet: 10_000, account: lvl(12) });
    await User.create({ _id: 'h4', wallet: 100, account: lvl(12) });
    await age();
    const r = await runHeist(['h1', 'h2', 'h3', 'h4'], always(0));
    expect(r).toMatchObject({ success: true, dropped: ['h4'] });
    const payout = Math.floor(heistRules.stake * heistRules.payout);
    expect(await wallets('h1', 'h2', 'h3', 'h4')).toEqual([10_000 - heistRules.stake + payout, 10_000 - heistRules.stake + payout, 10_000 - heistRules.stake + payout, 100]);
    // Cooldown: can't go again straight away
    expect(await runHeist(['h1', 'h2'], always(0))).toMatchObject({ tooFew: true });
  });

  it('trade swaps both sides at once, taxing coins; a stale offer moves nothing', async () => {
    await User.create({ _id: 't1', wallet: 10_000, account: lvl(5), inventory: { gem_ruby: 2 } });
    await User.create({ _id: 't2', wallet: 10_000, account: lvl(5), inventory: { fish_carp: 3 } });
    await age();
    await settleTrade('t1', 't2', { t1: { coins: 1_000, items: { gem_ruby: 1 } }, t2: { coins: 0, items: { fish_carp: 3 } } });
    const [p1, p2] = await Promise.all([getProfile('t1'), getProfile('t2')]);
    expect(p1.wallet).toBe(9_000);
    expect(p2.wallet).toBe(10_950);
    expect(p1.inventory).toMatchObject({ gem_ruby: 1, fish_carp: 3 });
    expect(p2.inventory).toMatchObject({ gem_ruby: 1 });
    await expect(settleTrade('t1', 't2', { t1: { coins: 0, items: { gem_ruby: 5 } }, t2: { coins: 100, items: {} } })).rejects.toThrow();
    expect((await getProfile('t2')).wallet).toBe(10_950);
  });

  it('give is taxed, needs level 3 and an existing recipient; gift moves tradable items', async () => {
    await User.create({ _id: 'g1', wallet: 10_000, account: lvl(5), inventory: { gem_ruby: 1 } });
    await User.create({ _id: 'g2', wallet: 0, account: lvl(0) });
    await age();
    expect(await giveCoins('g1', 'g2', 1_000)).toMatchObject({ received: 950, tax: 50 });
    await expect(giveCoins('g2', 'g1', 100)).rejects.toThrow(/level 3/);
    await expect(giveCoins('g1', 'nobody', 100)).rejects.toThrow(/haven't played/);
    await giftItem('g1', 'g2', 'gem_ruby', 1);
    expect((await getProfile('g2')).inventory).toMatchObject({ gem_ruby: 1 });
  });
});

describe('heist balance', () => {
  it('pays well under 5% of early-game income per hour, even with the best crew', async () => {
    const { hourly, scenarios } = await import('../src/game/balance.js');
    const best = Math.max(...[2, 3, 4, 5, 6].map((n) => heistRules.chance(n) * heistRules.stake * heistRules.payout - heistRules.stake));
    const perHour = best / heistRules.cooldownHours;
    const early = hourly(scenarios[1]!).net;
    expect(perHour / early).toBeLessThan(0.05);
  });
});

describe('anti-alt and daily giving limits (database)', () => {
  useTestDatabase();

  it('blocks new profiles and young Discord accounts from giving, with a clear message', async () => {
    const { giveCoins } = await import('../src/services/trade.js');
    const { SnowflakeUtil } = await import('discord.js');
    const young = String(SnowflakeUtil.generate({ timestamp: Date.now() - 5 * 86_400_000 }));
    const old = String(SnowflakeUtil.generate({ timestamp: Date.now() - 400 * 86_400_000 }));
    await User.create({ _id: 'fresh', wallet: 10_000, account: lvl(5) });
    await User.create({ _id: old, wallet: 10_000, account: lvl(5) });
    await User.create({ _id: young, wallet: 10_000, account: lvl(5) });
    await expect(giveCoins('fresh', old, 100)).rejects.toThrow(/played OctBot for 3 days/);
    await User.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
    await expect(giveCoins(young, old, 100)).rejects.toThrow(/Discord account must be at least 30 days old/);
    await expect(giveCoins(old, young, 100)).rejects.toThrow(/Their Discord account/);
    await expect(giveCoins(old, 'fresh', 100)).resolves.toMatchObject({ received: 95 });
  });

  it('limits coins to 10k × level a day (max 500k) and items to 20, resetting each UTC day', async () => {
    const { useAllowance, allowanceLeft } = await import('../src/services/antiAlt.js');
    await User.create({ _id: 'lim', wallet: 1_000_000, account: lvl(5) });
    const p = await getProfile('lim');
    const day1 = new Date('2026-11-24T12:00:00Z');
    await useAllowance(p, { coins: 30_000, items: 15 }, undefined, day1);
    await expect(useAllowance(p, { coins: 25_000 }, undefined, day1)).rejects.toThrow(/₪ 20,000 more in coins/);
    await expect(useAllowance(p, { items: 6 }, undefined, day1)).rejects.toThrow(/5 more items/);
    await useAllowance(p, { coins: 20_000, items: 5 }, undefined, day1);
    expect(allowanceLeft(await getProfile('lim'), day1)).toEqual({ coins: 0, items: 0 });
    const day2 = new Date('2026-11-25T01:00:00Z');
    await useAllowance(await getProfile('lim'), { coins: 50_000, items: 20 }, undefined, day2);
    expect(allowanceLeft(await getProfile('lim'), day2)).toEqual({ coins: 0, items: 0 });
  });

  it('a gift over the item limit moves nothing', async () => {
    const { giftItem } = await import('../src/services/trade.js');
    await User.create({ _id: 'gf1', wallet: 0, account: lvl(5), inventory: { fish_carp: 30 } });
    await User.create({ _id: 'gf2', wallet: 0, account: lvl(5) });
    await age();
    await expect(giftItem('gf1', 'gf2', 'fish_carp', 21)).rejects.toThrow(/Daily giving limit/);
    expect(((await getProfile('gf1')).inventory as Record<string, number>).fish_carp).toBe(30);
  });
});

describe('interrupted rounds (database)', () => {
  useTestDatabase();

  it('refunds open rounds once, and a late payout pays nothing', async () => {
    const { takeBet, payOut } = await import('../src/services/gambling.js');
    const { refundOpenRounds } = await import('../src/services/rounds.js');
    const { ActiveRound } = await import('../src/models/ActiveRound.js');
    await User.create({ _id: 'rr', wallet: 5_000 });
    const { roundId } = await takeBet('rr', 'blackjack', 2_000, { guildId: 'g', channelId: 'c' });
    expect((await getProfile('rr')).wallet).toBe(3_000);
    const refunds = await refundOpenRounds();
    expect(refunds).toEqual([{ kind: 'blackjack', userId: 'rr', amount: 2_000, channelId: 'c' }]);
    expect(await refundOpenRounds()).toEqual([]);
    await payOut('rr', 'blackjack', 2_000, 4_000, roundId);
    expect((await getProfile('rr')).wallet).toBe(5_000);
    expect(await ActiveRound.countDocuments()).toBe(0);
  });

  it('a finished heist leaves no open round', async () => {
    const { ActiveRound } = await import('../src/models/ActiveRound.js');
    for (const id of ['hx1', 'hx2']) await User.create({ _id: id, wallet: 10_000, account: lvl(12) });
    await age();
    await runHeist(['hx1', 'hx2'], always(0.99));
    expect(await ActiveRound.countDocuments()).toBe(0);
  });
});

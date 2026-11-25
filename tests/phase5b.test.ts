import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { CommunityGoal, Drop, Raid, SeasonEnd, SeasonScore } from '../src/models/Events';
import { MemberLevel } from '../src/models/MemberLevel';
import { totalXpForLevel } from '../src/content/levels';
import { businessRules, hireCost } from '../src/content/business';
import { dropRules, goalRules, raidRules, seasonRules } from '../src/content/events';
import { petRules, pets } from '../src/content/pets';
import { getProfile } from '../src/services/economy';
import { grant } from '../src/services/progression';
import { addSeasonPoints, currentSeason, payoutSeason } from '../src/services/seasons';
import { attackRaid, expireRaids, raidPayouts, settleGoals, spawnWeekly } from '../src/services/raids';
import { createDrop, grabDrop, noteChatter, shouldDrop } from '../src/services/drops';
import { adoptPet, carePet, petHappiness, petPerk } from '../src/services/pets';
import { buyTier, collectBusiness, hireWorker, managerCollectAll, pendingIncome } from '../src/services/business';
import { luckBonus } from '../src/services/progression';
import { weekNumber } from '../src/services/quests';

import { businessTiers as tiers } from '../src/content/business';
const STAND = tiers[0]!.perWorkerHour;
const lvl = (n: number) => ({ xp: totalXpForLevel(n), level: n, best: n });
const always = (v: number) => ({ next: () => v });
const old = () => User.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });

beforeAll(() => {
  env.ANTI_ALT_PROFILE_DAYS = undefined;
  env.ANTI_ALT_DISCORD_DAYS = undefined;
  env.SEASON_1_START = '2026-11-01T00:00:00Z';
  env.SEASON_LENGTH_DAYS = 30;
});
afterAll(() => {
  env.SEASON_1_START = undefined;
  env.SEASON_LENGTH_DAYS = undefined;
});

describe('pure rules', () => {
  it('season numbers follow the start date and length', () => {
    expect(currentSeason(new Date('2026-10-31T23:59:00Z'))).toBe(0);
    expect(currentSeason(new Date('2026-11-01T00:00:00Z'))).toBe(1);
    expect(currentSeason(new Date('2026-12-01T00:00:00Z'))).toBe(2);
  });

  it('drops need enough people chatting, the interval, then a roll', () => {
    const t = 1_000_000_000;
    expect(noteChatter('c1', 'a', t)).toBe(1);
    noteChatter('c1', 'b', t);
    expect(shouldDrop('c1', 2, 2, t, always(0))).toBe(false);
    expect(noteChatter('c1', 'c', t)).toBe(3);
    expect(shouldDrop('c1', 3, 2, t, always(0.99))).toBe(false);
    expect(shouldDrop('c1', 3, 2, t, always(0))).toBe(true);
    // Not again until the interval (30 min at 2/hour) has passed
    expect(shouldDrop('c1', 3, 2, t + 10 * 60_000, always(0))).toBe(false);
    expect(shouldDrop('c1', 3, 2, t + 31 * 60_000, always(0))).toBe(true);
  });

  it('raid rewards: base plus a damage share; MVP, top 3 and everyone else get crates', () => {
    const pay = raidPayouts({ a: 600, b: 300, c: 60, d: 40 });
    expect(pay.map((p) => p.crate)).toEqual([raidRules.reward.mvp, raidRules.reward.top3, raidRules.reward.top3, raidRules.reward.crate]);
    expect(pay[0]!.coins).toBe(raidRules.reward.base + Math.floor(raidRules.reward.perShare * 0.6));
  });

  it('pet happiness decays and the perk needs a happy pet', () => {
    const now = Date.now();
    const p = { pet: { species: 'cat', name: 'C', level: 10, xp: 0, happiness: 60, caredAt: new Date(now - 3 * 3_600_000) } } as never;
    expect(petHappiness(p, now)).toBe(60 - 3 * petRules.decayPerHour);
    expect(petPerk(p, 'cat', now)).toBe(pets.cat.perkAtMax);
    expect(petPerk(p, 'cat', now + 10 * 3_600_000)).toBe(0); // unhappy
    expect(luckBonus(p)).toBe(pets.cat.perkAtMax);
  });

  it('business income is capped offline, higher with a manager', () => {
    const now = Date.now();
    const biz = (manager: boolean) => ({ business: { tier: 'stand', workers: 10, manager, lastTick: new Date(now - 30 * 3_600_000) } }) as never;
    expect(pendingIncome(biz(false), now).amount).toBe(Math.floor(STAND * 10 * businessRules.offlineCapHours * 0.9));
    expect(pendingIncome(biz(true), now).amount).toBe(Math.floor(STAND * 10 * businessRules.managerCapHours * 0.9));
  });
});

describe('seasons and activity (database)', () => {
  useTestDatabase();

  it('activities that pay out give season points and community-goal progress; claims do not', async () => {
    const now = new Date();
    await User.create({ _id: 's1' });
    await CommunityGoal.create({ guildId: 'g', week: weekNumber(now), metric: 'fish', target: 100, endsAt: new Date(now.getTime() + 86_400_000) });
    await grant('s1', { wallet: 100 }, { source: 'fish', xp: 'fish', guildId: 'g' });
    // Played in another server: no credit to g
    await grant('s1', { wallet: 100 }, { source: 'fish', xp: 'fish', guildId: 'other' });
    await grant('s1', { wallet: 100 }, { source: 'daily', countEarned: false });
    const season = currentSeason(now);
    expect((await SeasonScore.findOne({ season, userId: 's1' }).lean())?.points).toBe(2 * seasonRules.points.activity);
    expect((await CommunityGoal.findOne({ guildId: 'g' }).lean())?.progress).toBe(1);
  });

  it('pays a finished season once, by place, to players with enough points', async () => {
    for (const [id, pts] of [['w1', 500], ['w2', 400], ['w3', 10]] as const) {
      await User.create({ _id: id });
      await SeasonScore.create({ season: 1, userId: id, points: pts });
    }
    const [a, b] = await Promise.all([payoutSeason(1), payoutSeason(1)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const w1 = await getProfile('w1');
    expect(w1.wallet).toBe(1_000 + seasonRules.rewards[0]!.coins);
    expect(w1.cosmetics?.owned).toContain('badge_season_champion');
    expect(w1.seasonAwards).toEqual([{ season: 1, place: 1 }]);
    expect((await getProfile('w3')).seasonAwards ?? []).toEqual([]);
    expect(await SeasonEnd.countDocuments()).toBe(1);
  });
});

describe('raids and goals (database)', () => {
  useTestDatabase();
  const monday = new Date('2026-11-23T10:00:00Z');

  it('spawns once a week, scaled to active players; mid-week only the goal', async () => {
    for (let i = 0; i < 5; i++) await MemberLevel.create({ guildId: 'g1', userId: `u${i}`, xp: 10 });
    expect(await spawnWeekly('g1', 'c', monday)).toEqual(['raid', 'goal']);
    expect(await spawnWeekly('g1', 'c', monday)).toEqual([]);
    expect((await Raid.findOne({ guildId: 'g1' }).lean())?.maxHp).toBe(5 * raidRules.hpPerPlayer);
    expect(await spawnWeekly('g2', 'c', new Date('2026-11-26T10:00:00Z'))).toEqual(['goal']);
  });

  it('attacks are cooled down; the final blow pays everyone exactly once', async () => {
    const now = new Date();
    for (const id of ['r1', 'r2']) await User.create({ _id: id, account: lvl(20) });
    await old();
    await Raid.create({ guildId: 'g3', week: weekNumber(now), bossId: 'kraken', maxHp: 1000, hp: 1000, endsAt: new Date(now.getTime() + 3_600_000) });
    const results = await Promise.allSettled([attackRaid('g3', 'r1', now, always(1)), attackRaid('g3', 'r2', now, always(1))]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ defeated: boolean }>).value);
    expect(ok.filter((r) => r.defeated).length).toBe(1);
    await expect(attackRaid('g3', 'r1', now)).rejects.toThrow();
    const raid = await Raid.findOne({ guildId: 'g3' }).lean();
    expect(raid?.status).toBe('defeated');
    // Only 2 different fighters: defeated, but no rewards (needs 3+)
    expect(raid?.rewarded).toBe(false);
    const paid = await Promise.all(['r1', 'r2'].map((id) => getProfile(id)));
    expect(paid.every((p) => p.wallet === 1_000)).toBe(true);
  });

  it('expired raids escape; goals pay contributors with enough contributions, once', async () => {
    const now = new Date();
    await Raid.create({ guildId: 'g4', week: 1, bossId: 'crab', maxHp: 100, hp: 100, endsAt: new Date(now.getTime() - 1) });
    expect(await expireRaids(now)).toBe(1);
    for (const id of ['c1', 'c2']) await User.create({ _id: id });
    await old();
    await CommunityGoal.create({ guildId: 'g5', week: 1, metric: 'fish', target: 10, progress: 10, contributors: { c1: 8, c2: 2 }, endsAt: new Date(now.getTime() + 1e6) });
    const [a, b] = await Promise.all([settleGoals(now), settleGoals(now)]);
    expect(a + b).toBe(1);
    expect((await getProfile('c1')).wallet).toBe(1_000 + goalRules.reward.coins);
    expect((await getProfile('c2')).wallet).toBe(1_000);
  });
});

describe('drops (database)', () => {
  useTestDatabase();

  it('first grab wins, the daily cap holds, new accounts and strangers are blocked', async () => {
    for (const id of ['d1', 'd2']) await User.create({ _id: id });
    await old();
    const drop = await createDrop('g', 'c', always(0.5));
    const tries = await Promise.allSettled([grabDrop(String(drop._id), 'd1'), grabDrop(String(drop._id), 'd2')]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    await expect(grabDrop(String((await createDrop('g', 'c'))._id), 'nobody')).rejects.toThrow(/Play something first/);
    await User.updateOne({ _id: 'd1' }, { $set: { drops: { day: Math.floor(Date.now() / 86_400_000), count: dropRules.dailyCap } } });
    const capped = await createDrop('g', 'c');
    await expect(grabDrop(String(capped._id), 'd1')).rejects.toThrow(/drops today/);
    expect((await Drop.findById(capped._id).lean())?.status).toBe('open'); // nothing moved
  });
});

describe('pets and business (database)', () => {
  useTestDatabase();

  it('adopting costs coins once; feeding is cooled down and can\'t run twice at once', async () => {
    await User.create({ _id: 'p1', wallet: 100_000, account: lvl(6) });
    await adoptPet('p1', 'dog', 'Rex');
    await expect(adoptPet('p1', 'cat', 'Tom')).rejects.toThrow(/already/);
    expect((await getProfile('p1')).wallet).toBe(100_000 - pets.dog.price);
    const tries = await Promise.allSettled([carePet('p1', 'feed'), carePet('p1', 'feed')]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    expect((await getProfile('p1')).wallet).toBe(100_000 - pets.dog.price - petRules.feed.cost);
  });

  it('business: buy in order, hiring settles pending first, collecting pays once', async () => {
    await User.create({ _id: 'b1', wallet: 200_000, account: lvl(15) });
    await expect(buyTier('b1', 'truck')).rejects.toThrow(/Start with/);
    await buyTier('b1', 'stand');
    await hireWorker('b1');
    expect((await getProfile('b1')).wallet).toBe(200_000 - 15_000 - hireCost('stand', 0));
    await User.updateOne({ _id: 'b1' }, { $set: { 'business.lastTick': new Date(Date.now() - 2 * 3_600_000) } });
    const tries = await Promise.allSettled([collectBusiness('b1', new Date(), always(0.99)), collectBusiness('b1', new Date(), always(0.99))]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
  });

  it('managers collect automatically once enough has built up', async () => {
    await User.create({ _id: 'b2', wallet: 0, business: { tier: 'stand', workers: 2, manager: true, lastTick: new Date(Date.now() - 7 * 3_600_000) } });
    expect(await managerCollectAll()).toBe(1);
    expect((await getProfile('b2')).wallet).toBeGreaterThan(0);
    expect(await managerCollectAll()).toBe(0);
  });
});

describe('balance', () => {
  it('a fully staffed business, collected round the clock, stays under ~25% of income at its stage', async () => {
    const { businessTiers } = await import('../src/content/business.js');
    const { hourly, scenarios } = await import('../src/game/balance.js');
    const ev = businessRules.events.reduce((s, e) => s + e.weight * e.mult, 0) / businessRules.events.reduce((s, e) => s + e.weight, 0);
    expect(ev).toBeGreaterThan(0.99);
    expect(ev).toBeLessThan(1.02);
    const stage = { stand: 1, truck: 2, cafe: 2, factory: 3 } as const;
    for (const t of businessTiers) {
      const perDay = t.perWorkerHour * t.maxWorkers * 24 * (1 - businessRules.upkeep) * ev;
      const active = 1.5 * hourly(scenarios[stage[t.id]]!).net;
      expect(perDay / (active + perDay), t.id).toBeLessThan(0.26);
    }
  });
});

describe('review fixes (database)', () => {
  useTestDatabase();
  const now = new Date();
  const week = weekNumber(now);

  it('one raid reward per player per week, across servers', async () => {
    const { finishRaid } = await import('../src/services/raids.js');
    for (const id of ['rf1', 'rf2', 'rf3']) await User.create({ _id: id });
    await old();
    for (const g of ['gA', 'gB']) await Raid.create({ guildId: g, week, bossId: 'crab', maxHp: 100, hp: 0, damage: { rf1: 60, rf2: 20, rf3: 20 }, endsAt: new Date(now.getTime() + 3_600_000) });
    for (const r of await Raid.find().lean()) await finishRaid(String(r._id));
    const p = await getProfile('rf1');
    expect(p.wallet).toBe(1_000 + raidRules.reward.base + Math.floor(raidRules.reward.perShare * 0.6));
    expect(await Raid.countDocuments({ status: 'defeated' })).toBe(2);
  });

  it('one goal reward per player per week; new profiles are skipped at payout', async () => {
    await User.create({ _id: 'gf1' });
    await old();
    await User.create({ _id: 'gnew' });
    for (const g of ['gA', 'gB']) await CommunityGoal.create({ guildId: g, week, metric: 'fish', target: 5, progress: 5, contributors: { gf1: 5, gnew: 5 }, endsAt: new Date(now.getTime() + 1e6) });
    await settleGoals(now);
    expect((await getProfile('gf1')).wallet).toBe(1_000 + goalRules.reward.coins);
    expect((await getProfile('gnew')).wallet).toBe(1_000);
  });

  it('new profiles can\'t attack raids', async () => {
    await User.create({ _id: 'rnew', account: lvl(10) });
    await Raid.create({ guildId: 'gN', week, bossId: 'crab', maxHp: 1_000, hp: 1_000, endsAt: new Date(now.getTime() + 3_600_000) });
    await expect(attackRaid('gN', 'rnew', now)).rejects.toThrow(/3 days/);
  });

  it('a raid whose payout failed is paid by recovery instead of escaping', async () => {
    const { recoverRaids } = await import('../src/services/raids.js');
    for (const id of ['rc1', 'rc2', 'rc3']) await User.create({ _id: id });
    await old();
    await Raid.create({ guildId: 'gR', week, bossId: 'crab', maxHp: 100, hp: -20, damage: { rc1: 100, rc2: 10, rc3: 10 }, endsAt: new Date(now.getTime() - 1) });
    expect(await recoverRaids()).toBe(1);
    expect(await expireRaids(now)).toBe(0);
    expect((await Raid.findOne({ guildId: 'gR' }).lean())?.status).toBe('defeated');
    expect((await getProfile('rc1')).wallet).toBeGreaterThan(1_000);
  });

  it('upgrading charges the difference in hire cost for kept workers', async () => {
    const { upgradeCost } = await import('../src/content/business.js');
    let extra = 0;
    for (let n = 0; n < 10; n++) extra += hireCost('factory', n) - hireCost('cafe', n);
    expect(upgradeCost('cafe', 'factory', 10)).toBe(750_000 + extra);
    await User.create({ _id: 'up', wallet: 10_000_000, account: lvl(15), business: { tier: 'stand', workers: 10, lastTick: new Date() } });
    await buyTier('up', 'truck');
    expect((await getProfile('up')).wallet).toBe(10_000_000 - upgradeCost('stand', 'truck', 10));
  });

  it('hiring a manager doesn\'t raise the cap retroactively', async () => {
    const { hireManager } = await import('../src/services/business.js');
    await User.create({ _id: 'mg', wallet: 100_000, business: { tier: 'stand', workers: 10, lastTick: new Date(Date.now() - 30 * 3_600_000) } });
    await hireManager('mg');
    const p = await getProfile('mg');
    // Paid out the 8h cap, minus the manager's price; the clock restarted
    expect(p.wallet).toBe(100_000 + Math.floor(STAND * 10 * 8 * 0.9) - 7_500);
    expect(pendingIncome(p).amount).toBe(0);
  });
});

describe('5b answers (database)', () => {
  useTestDatabase();

  it('raids pay only with 3+ different eligible players (new alts don\'t count)', async () => {
    const { finishRaid } = await import('../src/services/raids.js');
    for (const id of ['h1', 'h2']) await User.create({ _id: id });
    await old();
    await User.create({ _id: 'halt' }); // brand-new profile: not eligible
    await Raid.create({ guildId: 'gH', week: weekNumber(new Date()), bossId: 'crab', maxHp: 100, hp: 0, damage: { h1: 50, h2: 30, halt: 20 }, endsAt: new Date(Date.now() + 3_600_000) });
    await finishRaid(String((await Raid.findOne({ guildId: 'gH' }).lean())!._id));
    expect((await Raid.findOne({ guildId: 'gH' }).lean())?.rewarded).toBe(false);
    expect((await getProfile('h1')).wallet).toBe(1_000);
  });

  it('the real bot saves the season calendar once Season 1 starts and ignores later env changes', async () => {
    const { loadSeasonCalendar, seasonConfig, resetSeasonCalendar } = await import('../src/services/seasons.js');
    env.SEASON_1_START = '2026-11-01T00:00:00Z';
    env.SEASON_LENGTH_DAYS = 30;
    await loadSeasonCalendar(false, new Date('2026-11-05T00:00:00Z'));
    env.SEASON_LENGTH_DAYS = 7;
    env.SEASON_1_START = '2026-12-01T00:00:00Z';
    const note = await loadSeasonCalendar(false, new Date('2026-11-06T00:00:00Z'));
    expect(note).toMatch(/ignored/);
    expect(seasonConfig().lengthDays).toBe(30);
    expect(currentSeason(new Date('2026-12-02T00:00:00Z'))).toBe(2);
    // The test bot follows the env
    await loadSeasonCalendar(true, new Date('2026-12-02T00:00:00Z'));
    expect(seasonConfig().lengthDays).toBe(7);
    resetSeasonCalendar();
    env.SEASON_1_START = '2026-11-01T00:00:00Z';
    env.SEASON_LENGTH_DAYS = 30;
  });
});

describe('combined income', () => {
  it('late game (level 15 and 35) for an engaged player stays under +25% vs the 2a baseline', async () => {
    const { rows } = await import('../src/game/income.js');
    for (const r of rows().filter((x) => x.level >= 15)) expect(r.over, r.name).toBeLessThan(0.25);
  });
});

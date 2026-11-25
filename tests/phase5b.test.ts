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
import { setActiveGuild } from '../src/services/activity';
import { addSeasonPoints, currentSeason, payoutSeason } from '../src/services/seasons';
import { attackRaid, expireRaids, raidPayouts, settleGoals, spawnWeekly } from '../src/services/raids';
import { createDrop, grabDrop, noteChatter, shouldDrop } from '../src/services/drops';
import { adoptPet, carePet, petHappiness, petPerk } from '../src/services/pets';
import { buyTier, collectBusiness, hireWorker, managerCollectAll, pendingIncome } from '../src/services/business';
import { luckBonus } from '../src/services/progression';
import { weekNumber } from '../src/services/quests';

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
    expect(pendingIncome(biz(false), now).amount).toBe(Math.floor(45 * 10 * businessRules.offlineCapHours * 0.9));
    expect(pendingIncome(biz(true), now).amount).toBe(Math.floor(45 * 10 * businessRules.managerCapHours * 0.9));
  });
});

describe('seasons and activity (database)', () => {
  useTestDatabase();

  it('activities that pay out give season points and community-goal progress; claims do not', async () => {
    const now = new Date();
    await User.create({ _id: 's1' });
    await CommunityGoal.create({ guildId: 'g', week: weekNumber(now), metric: 'fish', target: 100, endsAt: new Date(now.getTime() + 86_400_000) });
    setActiveGuild('s1', 'g');
    await grant('s1', { wallet: 100 }, { source: 'fish', xp: 'fish' });
    await grant('s1', { wallet: 100 }, { source: 'daily', countEarned: false });
    const season = currentSeason(now);
    expect((await SeasonScore.findOne({ season, userId: 's1' }).lean())?.points).toBe(seasonRules.points.activity);
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
    await Raid.create({ guildId: 'g3', week: weekNumber(now), bossId: 'kraken', maxHp: 1000, hp: 1000, endsAt: new Date(now.getTime() + 3_600_000) });
    const results = await Promise.allSettled([attackRaid('g3', 'r1', now, always(1)), attackRaid('g3', 'r2', now, always(1))]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ defeated: boolean }>).value);
    expect(ok.filter((r) => r.defeated).length).toBe(1);
    await expect(attackRaid('g3', 'r1', now)).rejects.toThrow();
    const raid = await Raid.findOne({ guildId: 'g3' }).lean();
    expect(raid?.status).toBe('defeated');
    const paid = await Promise.all(['r1', 'r2'].map((id) => getProfile(id)));
    expect(paid.every((p) => p.wallet > 1_000)).toBe(true);
  });

  it('expired raids escape; goals pay contributors with enough contributions, once', async () => {
    const now = new Date();
    await Raid.create({ guildId: 'g4', week: 1, bossId: 'crab', maxHp: 100, hp: 100, endsAt: new Date(now.getTime() - 1) });
    expect(await expireRaids(now)).toBe(1);
    for (const id of ['c1', 'c2']) await User.create({ _id: id });
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

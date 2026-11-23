import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { MemberLevel } from '../src/models/MemberLevel';
import { totalXpForLevel } from '../src/content/levels';
import { questRewards } from '../src/content/quests';
import { getProfile, type Profile } from '../src/services/economy';
import { claimBonus, claimQuest, ensureQuests, generateSet, nextReset, questSet, rerollQuest, weekNumber } from '../src/services/quests';
import { grant } from '../src/services/progression';
import { claimDueReminders } from '../src/services/reminders';
import { board, clearLeaderboardCache, rankOf } from '../src/services/leaderboard';
import { dayNumber } from '../src/game/streaks';
import { hourly, scenarios } from '../src/game/balance';

const lvl = (n: number) => ({ xp: totalXpForLevel(n), level: n, best: n });
const fake = (over: Record<string, unknown> = {}) => ({ _id: 'p', stats: {}, tools: {}, account: lvl(5), ...over }) as unknown as Profile;

describe('quests (pure)', () => {
  it('weeks start on Monday 00:00 UTC; resets are at the next day/week boundary', () => {
    const sun = new Date('2026-11-29T23:59:00Z');
    const mon = new Date('2026-11-30T00:00:00Z');
    expect(weekNumber(mon)).toBe(weekNumber(sun) + 1);
    expect(nextReset('weekly', sun).toISOString()).toBe('2026-11-30T00:00:00.000Z');
    expect(nextReset('daily', new Date('2026-11-24T10:00:00Z')).toISOString()).toBe('2026-11-25T00:00:00.000Z');
  });

  it('three different quests, the same for the same player and day, only ones they can do', () => {
    const p = fake();
    const a = generateSet(p, 'daily', 20_000);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    expect(generateSet(p, 'daily', 20_000)).toEqual(a);
    for (let d = 0; d < 200; d++) {
      for (const q of generateSet(fake({ account: lvl(1) }), 'daily', d)) expect(['hunt', 'dig', 'crime']).not.toContain(q.id);
    }
  });

  it('quest income stays a modest share: at most 35% of 1.5 active hours a day at every stage', () => {
    for (const s of scenarios) {
      // 3 daily quests + bonus crate (counted at its sell value), plus a seventh of the weekly set
      const daily = 3 * questRewards.daily.coins(s.level) + (s.level >= 10 ? 9_000 : 2_000);
      const weekly = (3 * questRewards.weekly.coins(s.level) + (s.level >= 20 ? 36_000 : 9_000)) / 7;
      const share = (daily + weekly) / (1.5 * hourly(s).net + daily + weekly);
      expect(share, s.name).toBeLessThan(0.35);
    }
  });
});

describe('quests (database)', () => {
  useTestDatabase();

  it('hands out quests once per day; concurrent calls agree; a new day resets only the daily set', async () => {
    await User.create({ _id: 'q1', account: lvl(5) });
    const day1 = new Date('2026-11-24T10:00:00Z');
    const p = await getProfile('q1');
    const [a, b] = await Promise.all([ensureQuests(p, day1), ensureQuests(p, day1)]);
    expect(questSet(a, 'daily').list).toEqual(questSet(b, 'daily').list);
    expect(questSet(await getProfile('q1'), 'daily').list).toHaveLength(3);
    const weekly = questSet(await getProfile('q1'), 'weekly').list;
    const day2 = await ensureQuests(await getProfile('q1'), new Date('2026-11-25T10:00:00Z'));
    expect(day2.quests?.daily?.day).toBe(dayNumber(new Date('2026-11-25T10:00:00Z')));
    expect(questSet(day2, 'weekly').list).toEqual(weekly);
  });

  it('progress counts from when the quest was given; a claim pays once and only when done', async () => {
    const now = new Date('2026-11-24T10:00:00Z');
    await User.create({ _id: 'q2', account: lvl(5), stats: { worked: 100 }, quests: { daily: { day: dayNumber(now), list: [{ id: 'work', target: 3, base: 100, claimed: false }], rerolls: 0 }, weekly: { week: weekNumber(now), list: [] } } });
    await expect(claimQuest('q2', 'daily', 0, now)).rejects.toThrow(/Not done yet: 0 \/ 3/);
    await User.updateOne({ _id: 'q2' }, { $inc: { 'stats.worked': 3 } });
    const before = (await getProfile('q2')).wallet;
    const tries = await Promise.allSettled([claimQuest('q2', 'daily', 0, now), claimQuest('q2', 'daily', 0, now)]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    const after = await getProfile('q2');
    expect(after.wallet).toBe(before + questRewards.daily.coins(5));
    expect(after.stats?.questsDone).toBe(1);
    // A stale menu after the reset can't claim against the new set
    await expect(claimQuest('q2', 'daily', 0, new Date('2026-11-25T10:00:00Z'))).rejects.toThrow();
  });

  it('the bonus chest needs all three claimed and pays once; one reroll per set', async () => {
    const now = new Date('2026-11-24T10:00:00Z');
    const list = [{ id: 'work', target: 1, base: 0, claimed: true }, { id: 'mine', target: 1, base: 0, claimed: true }, { id: 'fish', target: 1, base: 0, claimed: false }];
    await User.create({ _id: 'q3', account: lvl(5), quests: { daily: { day: dayNumber(now), list, rerolls: 0 }, weekly: { week: weekNumber(now), list: [] } } });
    await expect(claimBonus('q3', 'daily', now)).rejects.toThrow(/all three/);
    const swapped = await rerollQuest('q3', 'daily', 2, now);
    expect(['work', 'mine', 'fish']).not.toContain(swapped.id);
    await expect(rerollQuest('q3', 'daily', 2, now)).rejects.toThrow(/reroll/);
    await User.updateOne({ _id: 'q3' }, { $set: { 'quests.daily.list.2.claimed': true } });
    const tries = await Promise.allSettled([claimBonus('q3', 'daily', now), claimBonus('q3', 'daily', now)]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    expect((await getProfile('q3')).inventory).toMatchObject({ crate_common: 1 });
  });

  it('activity coins count toward "earn" quests', async () => {
    await User.create({ _id: 'q4' });
    await grant('q4', { wallet: 1_234 }, { source: 'test' });
    expect((await getProfile('q4')).stats?.earned).toBe(1_234);
  });
});

describe('reminders (database)', () => {
  useTestDatabase();

  it('reminds once a day, from the usual claim hour, only when the daily is waiting', async () => {
    const day = new Date('2026-11-24T00:00:00Z');
    await User.create({ _id: 'm1', settings: { dmReminders: true }, streak: { count: 5, lastDaily: new Date('2026-11-23T18:30:00Z'), lastWeekly: new Date() } });
    await User.create({ _id: 'm2', settings: { dmReminders: true }, streak: { lastDaily: new Date('2026-11-24T01:00:00Z'), lastWeekly: new Date() } });
    await User.create({ _id: 'm3', settings: { dmReminders: false } });
    expect(await claimDueReminders(new Date(day.getTime() + 10 * 3_600_000))).toEqual([]);
    const at19 = new Date(day.getTime() + 19 * 3_600_000);
    expect(await claimDueReminders(at19)).toEqual([{ userId: 'm1', kind: 'daily', streak: 5 }]);
    expect(await claimDueReminders(at19)).toEqual([]);
  });

  it('reminds about the weekly once it has been 7 days', async () => {
    const now = new Date('2026-11-24T12:00:00Z');
    await User.create({ _id: 'm4', settings: { dmReminders: true }, streak: { lastDaily: now, lastWeekly: new Date(now.getTime() - 8 * 86_400_000) } });
    expect(await claimDueReminders(now)).toEqual([{ userId: 'm4', kind: 'weekly', streak: 0 }]);
    expect(await claimDueReminders(now)).toEqual([]);
  });
});

describe('leaderboards (database)', () => {
  useTestDatabase();

  it('ranks coins globally and per server, packs prestige into level, and ranks server XP', async () => {
    clearLeaderboardCache();
    await User.create({ _id: 'l1', wallet: 100, bank: 900, account: { ...lvl(10), prestige: 0 } });
    await User.create({ _id: 'l2', wallet: 5_000, bank: 0, account: { ...lvl(2), prestige: 1 } });
    await User.create({ _id: 'l3', wallet: 50, bank: 0, account: { ...lvl(30), prestige: 0 } });
    const global = await board('coins', 0, { guildId: null, members: null });
    expect(global.rows.map((r) => r.userId)).toEqual(['l2', 'l1', 'l3']);
    const server = await board('coins', 0, { guildId: 'g', members: ['l1', 'l3'] });
    expect(server.rows.map((r) => r.userId)).toEqual(['l1', 'l3']);
    expect(await rankOf('coins', 'l3', { guildId: 'g', members: ['l1', 'l3'] })).toEqual({ rank: 2, value: 50 });
    const level = await board('level', 0, { guildId: null, members: null });
    expect(level.rows.map((r) => r.userId)).toEqual(['l2', 'l3', 'l1']);
    await MemberLevel.create({ guildId: 'g', userId: 'l1', xp: 500 });
    await MemberLevel.create({ guildId: 'g', userId: 'l3', xp: 900 });
    const srv = await board('server', 0, { guildId: 'g', members: null });
    expect(srv.rows.map((r) => r.userId)).toEqual(['l3', 'l1']);
  });
});

describe('review fixes (database)', () => {
  useTestDatabase();

  it('reminds old profiles that have no reminders field, and a late-hour player never blocks others', async () => {
    const at19 = new Date('2026-11-24T19:00:00Z');
    // Raw documents, like profiles created before reminders existed
    await User.collection.insertOne({ _id: 'old1' as never, settings: { dmReminders: true }, streak: { count: 2, lastDaily: new Date('2026-11-23T09:00:00Z') } });
    await User.collection.insertOne({ _id: 'late' as never, settings: { dmReminders: true }, streak: { count: 1, lastDaily: new Date('2026-11-23T23:00:00Z') } });
    const due = await claimDueReminders(at19);
    expect(due.filter((d) => d.kind === 'daily').map((d) => d.userId)).toEqual(['old1']);
  });

  it('hands out quests to a raw old profile with no quests field', async () => {
    await User.collection.insertOne({ _id: 'rawq' as never, wallet: 5, account: { level: 4, xp: totalXpForLevel(4) } });
    const p = await ensureQuests(await getProfile('rawq'), new Date('2026-11-24T10:00:00Z'));
    expect(questSet(p, 'daily').list).toHaveLength(3);
    expect(questSet(p, 'weekly').list).toHaveLength(3);
  });

  it('selling shop items does not advance sell quests (fish only)', async () => {
    const { sell } = await import('../src/services/items.js');
    await User.create({ _id: 'sq', inventory: { scratch_card: 10, fish_carp: 2 } });
    await sell('sq', { scratch_card: 10 });
    expect((await getProfile('sq')).stats?.fishSold ?? 0).toBe(0);
    await sell('sq', { fish_carp: 2 });
    expect((await getProfile('sq')).stats?.fishSold).toBe(2);
  });

  it('messages count once a minute across all servers', async () => {
    const { awardChatXp } = await import('../src/services/levels.js');
    await User.create({ _id: 'chatty' });
    const t = new Date('2026-11-24T12:00:00Z');
    await awardChatXp('gA', 'chatty', 1, t);
    await awardChatXp('gB', 'chatty', 1, new Date(t.getTime() + 1_000));
    await awardChatXp('gC', 'chatty', 1, new Date(t.getTime() + 2_000));
    expect((await getProfile('chatty')).stats?.messages).toBe(1);
  });

  it('daily and weekly claims do not count as activity earnings', async () => {
    await User.create({ _id: 'earn2' });
    await grant('earn2', { wallet: 7_500 }, { source: 'daily', countEarned: false });
    expect((await getProfile('earn2')).stats?.earned ?? 0).toBe(0);
  });

  it('net worth includes items; ties rank like the list; global boards are shared across servers', async () => {
    clearLeaderboardCache();
    await User.create({ _id: 'n1', wallet: 1_000, inventory: { gem_ruby: 1 } });
    await User.create({ _id: 'n2', wallet: 1_000 });
    await User.create({ _id: 'n3', wallet: 1_000 });
    const b = await board('coins', 0, { guildId: 'x', members: null });
    expect(b.rows[0]!.userId).toBe('n1');
    expect(b.rows[0]!.value).toBeGreaterThan(1_000);
    // n2 and n3 tie: n2 is listed first, and their footer ranks agree with the list
    expect(b.rows.map((r) => r.userId)).toEqual(['n1', 'n2', 'n3']);
    expect((await rankOf('coins', 'n2', { guildId: 'x', members: null }))?.rank).toBe(2);
    expect((await rankOf('coins', 'n3', { guildId: 'x', members: null }))?.rank).toBe(3);
    // The same global page from another server comes from the cache (same result even after a change)
    await User.updateOne({ _id: 'n3' }, { $set: { wallet: 99_999 } });
    expect((await board('coins', 0, { guildId: 'y', members: null })).rows[0]!.userId).toBe('n1');
  });

  it('gambling winnings board lists only players who are ahead', async () => {
    clearLeaderboardCache();
    await User.create({ _id: 'gw1', stats: { gambling: { wagered: 1_000, paidOut: 5_000 } } });
    await User.create({ _id: 'gw2', stats: { gambling: { wagered: 5_000, paidOut: 1_000 } } });
    const b = await board('gambling', 0, { guildId: null, members: null });
    expect(b.rows.map((r) => [r.userId, r.value])).toEqual([['gw1', 4_000]]);
  });
});

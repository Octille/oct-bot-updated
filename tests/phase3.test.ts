import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { Transaction } from '../src/models/Transaction';
import { MemberLevel } from '../src/models/MemberLevel';
import { achievements } from '../src/content/achievements';
import { cosmetics, getCosmetic, shopCosmetics } from '../src/content/cosmetics';
import { serverLevelFromXp, serverXpToNext, totalServerXpForLevel, totalXpForLevel } from '../src/content/levels';
import { perks, prestigeLevel } from '../src/content/prestige';
import { checkAchievements } from '../src/services/achievements';
import { buyPerk, prestige } from '../src/services/prestige';
import { awardChatXp, rewardRoleChanges, xpMultiplier } from '../src/services/levels';
import { capacityOf, deposit, getProfile } from '../src/services/economy';
import { syncLevel, unlockLevel } from '../src/services/progression';
import { voiceEarners } from '../src/scheduler/voiceXp';
import { rankCard, levelUpCard } from '../src/lib/cards';

describe('achievements (content)', () => {
  it('has 40+ achievements with unique ids, valid rewards and some hidden', () => {
    expect(achievements.length).toBeGreaterThanOrEqual(40);
    expect(new Set(achievements.map((a) => a.id)).size).toBe(achievements.length);
    expect(achievements.filter((a) => a.hidden).length).toBeGreaterThanOrEqual(5);
    for (const a of achievements) {
      expect(a.goal, a.id).toBeGreaterThan(0);
      expect(a.reward.coins || a.reward.item || a.reward.cosmetic, a.id).toBeTruthy();
      if (a.reward.cosmetic) expect(getCosmetic(a.reward.cosmetic)?.exclusive, a.id).toBe('achievement');
    }
  });

  it('includes the crime titles', () => {
    const byId = new Map(achievements.map((a) => [a.id, a]));
    expect(byId.get('light_fingers')?.reward.cosmetic).toBe('title_light_fingers');
    expect(byId.get('master_hacker')?.reward.cosmetic).toBe('title_master_hacker');
    expect(byId.get('art_thief')?.reward.cosmetic).toBe('title_art_thief');
    expect(byId.get('repeat_offender')?.reward.cosmetic).toBe('title_repeat_offender');
  });

  it('every achievement-only cosmetic is actually a reward, and none are sold', () => {
    const rewarded = new Set(achievements.map((a) => a.reward.cosmetic).filter(Boolean));
    for (const c of cosmetics.filter((x) => x.exclusive === 'achievement')) expect(rewarded.has(c.id), c.id).toBe(true);
    for (const c of shopCosmetics()) expect(c.exclusive).toBeUndefined();
  });
});

describe('server levels (pure)', () => {
  it('level curve round-trips', () => {
    for (const l of [0, 1, 5, 20, 60]) {
      expect(serverLevelFromXp(totalServerXpForLevel(l)).level).toBe(l);
      expect(serverLevelFromXp(totalServerXpForLevel(l) + serverXpToNext(l) - 1).level).toBe(l);
    }
  });

  it('uses the highest matching multiplier, doubled during double XP', () => {
    const levels = { multipliers: [{ targetId: 'role', mult: 1.5 }, { targetId: 'chan', mult: 2 }], doubleXpUntil: null, weekendDoubleXp: false };
    const wed = new Date('2026-11-25T12:00:00Z');
    expect(xpMultiplier(levels, ['other'], wed)).toBe(1);
    expect(xpMultiplier(levels, ['role'], wed)).toBe(1.5);
    expect(xpMultiplier(levels, ['role', 'chan'], wed)).toBe(2);
    expect(xpMultiplier({ ...levels, doubleXpUntil: new Date(wed.getTime() + 1000) }, ['role'], wed)).toBe(3);
    expect(xpMultiplier({ ...levels, weekendDoubleXp: true }, [], new Date('2026-11-28T12:00:00Z'))).toBe(2);
    expect(xpMultiplier({ ...levels, weekendDoubleXp: true }, [], wed)).toBe(1);
  });

  it('reward roles stack or keep only the highest', () => {
    const rewards = [{ level: 5, roleId: 'a' }, { level: 10, roleId: 'b' }, { level: 20, roleId: 'c' }];
    expect(rewardRoleChanges(rewards, 4, 10, true)).toEqual({ add: ['a', 'b'], remove: [] });
    expect(rewardRoleChanges(rewards, 9, 10, false)).toEqual({ add: ['b'], remove: ['a', 'c'] });
    expect(rewardRoleChanges(rewards, 1, 3, false)).toEqual({ add: [], remove: [] });
  });

  it('voice XP needs two eligible people; muted, deafened and bots don\'t count', () => {
    const m = (id: string, o: { bot?: boolean; mute?: boolean; deaf?: boolean } = {}) =>
      ({ id, user: { bot: !!o.bot }, voice: { mute: !!o.mute, deaf: !!o.deaf } }) as unknown as Parameters<typeof voiceEarners>[0][number];
    expect(voiceEarners([m('a'), m('b')]).length).toBe(2);
    expect(voiceEarners([m('a'), m('b', { mute: true })])).toEqual([]);
    expect(voiceEarners([m('a'), m('bot', { bot: true })])).toEqual([]);
    expect(voiceEarners([m('a'), m('b'), m('c', { deaf: true })]).map((x) => (x as unknown as { id: string }).id)).toEqual(['a', 'b']);
  });
});

describe('help', () => {
  it('hides commands with default_member_permissions from members without them', async () => {
    const { canSee } = await import('../src/ui/screens/help.js');
    const manageGuild = (1n << 5n).toString();
    expect(canSee({}, null)).toBe(true);
    expect(canSee({ default_member_permissions: manageGuild }, null)).toBe(false);
    expect(canSee({ default_member_permissions: manageGuild }, '0')).toBe(false);
    expect(canSee({ default_member_permissions: manageGuild }, (1n << 5n | 1n << 10n).toString())).toBe(true);
  });
});

describe('cards', () => {
  const style = { background: '#f39c12,#6e1a0a', frame: '#af810e,#f7dc6f', accent: '#af810e', badge: 'badge_founder' };
  it('render PNGs without an avatar (no network)', async () => {
    const rank = await rankCard({ person: { name: 'Tester', title: 'Founder', avatarUrl: null }, style, level: 4, into: 10, needed: 300, rank: 2, members: 5, accountLevel: 9, prestige: null });
    const up = await levelUpCard({ person: { name: 'Tester', title: null, avatarUrl: null }, style, from: 3, to: 4 });
    for (const png of [rank, up]) expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

describe('phase 3 (database)', () => {
  useTestDatabase();

  it('pays each achievement once, even when checked concurrently', async () => {
    await User.create({ _id: 'ach1', stats: { worked: 60, crimeWins: { pickpocket: 50 } } });
    const results = await Promise.all([checkAchievements('ach1'), checkAchievements('ach1'), checkAchievements('ach1')]);
    const ids = results.flat().map((a) => a.id).sort();
    expect(ids).toEqual(['first_shift', 'light_fingers', 'regular']);
    const p = await getProfile('ach1');
    expect(p.wallet).toBe(1_000 + 500 + 5_000);
    expect(p.cosmetics?.owned).toContain('title_light_fingers');
    expect(await Transaction.countDocuments({ userId: 'ach1', source: 'achievement' })).toBeGreaterThan(0);
    expect(await checkAchievements('ach1')).toEqual([]);
  });

  it('level achievements count a level that was set directly (best still 0)', async () => {
    await User.create({ _id: 'lvset', account: { xp: totalXpForLevel(25), level: 25, best: 0 } });
    const ids = (await checkAchievements('lvset')).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['getting_started', 'climbing', 'seasoned']));
  });

  it('prestige resets level and coins once, keeps unlocks, and pays tokens', async () => {
    await User.create({
      _id: 'pr1', wallet: 80_000, bank: 20_000, account: { xp: totalXpForLevel(prestigeLevel), level: prestigeLevel, best: prestigeLevel },
      inventory: { fish_carp: 5, gem_ruby: 2, crime_painting: 1, crate_rare: 3, xp_boost: 2, streak_freeze: 1 },
    });
    const tries = await Promise.allSettled([prestige('pr1'), prestige('pr1'), prestige('pr1')]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    const p = await getProfile('pr1');
    expect(p.account).toMatchObject({ level: 0, xp: 0, prestige: 1, best: prestigeLevel });
    expect(p.wallet).toBe(1_000);
    expect(p.bank).toBe(0);
    expect(p.prestige?.tokens).toBe(1);
    // Loot and crates are wiped; consumables are kept
    const inv = Object.fromEntries(Object.entries(p.inventory ?? {}).filter(([, q]) => (q as number) > 0));
    expect(inv).toEqual({ xp_boost: 2, streak_freeze: 1 });
    expect(unlockLevel(p)).toBe(prestigeLevel);
    await expect(prestige('pr1')).rejects.toThrow(/level/);
  });

  it('levelling up again after a prestige does not pay milestone crates twice', async () => {
    await User.create({ _id: 'pr2', account: { xp: totalXpForLevel(10), level: 0, prestige: 1, best: 35 } });
    const up = await syncLevel(await getProfile('pr2'));
    expect(up?.to).toBe(10);
    expect(up?.crates).toEqual([]);
    expect(up?.unlocks).toEqual([]);
    expect((await getProfile('pr2')).inventory).toEqual({});
  });

  it('perks are bought once, and Deep Pockets raises the bank cap in the database too', async () => {
    await User.create({ _id: 'pk1', wallet: 1_000_000, account: { prestige: 1 }, prestige: { tokens: 3 } });
    const tries = await Promise.allSettled([buyPerk('pk1', 'deep_pockets'), buyPerk('pk1', 'deep_pockets')]);
    expect(tries.filter((t) => t.status === 'fulfilled').length).toBe(1);
    const p = await getProfile('pk1');
    expect(p.prestige?.tokens).toBe(3 - perks.find((x) => x.id === 'deep_pockets')!.cost);
    const cap = capacityOf(p);
    const { amount } = await deposit('pk1', 'all');
    expect(amount).toBe(cap);
    expect(cap).toBe(Math.floor(capacityOf({ ...p, prestige: { tokens: 0, perks: [] } }) * 1.25));
  });

  it('chat XP counts once per minute and never creates a game profile', async () => {
    const t0 = new Date('2026-11-23T10:00:00Z');
    const first = await awardChatXp('g1', 'chat1', 1, t0);
    expect(first).not.toBeUndefined();
    expect(await awardChatXp('g1', 'chat1', 1, new Date(t0.getTime() + 30_000))).toBeUndefined();
    expect(await awardChatXp('g1', 'chat1', 1, new Date(t0.getTime() + 61_000))).not.toBeUndefined();
    const doc = await MemberLevel.findOne({ guildId: 'g1', userId: 'chat1' }).lean();
    expect(doc?.messages).toBe(2);
    expect(doc?.xp).toBeGreaterThanOrEqual(30);
    expect(await User.exists({ _id: 'chat1' })).toBeNull();
  });

  it('chat XP reports a level-up exactly once', async () => {
    await MemberLevel.create({ guildId: 'g2', userId: 'lv1', xp: serverXpToNext(0) - 1, level: 0 });
    const up = await awardChatXp('g2', 'lv1', 1, new Date('2026-11-23T11:00:00Z'));
    expect(up).toMatchObject({ from: 0, to: 1 });
    expect((await MemberLevel.findOne({ guildId: 'g2', userId: 'lv1' }).lean())?.level).toBe(1);
  });
});

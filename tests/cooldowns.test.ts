import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import * as cooldowns from '../src/services/cooldowns';
import { User } from '../src/models/User';

useTestDatabase();

describe('cooldowns', () => {
  it('claims once, then reports the remaining time', async () => {
    const first = await cooldowns.claim('u1', 'daily', 60_000);
    expect(first.ok).toBe(true);
    const second = await cooldowns.claim('u1', 'daily', 60_000);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.remainingMs).toBeGreaterThan(55_000);
  });

  it('is stored in the database (survives restarts)', async () => {
    await cooldowns.claim('u1', 'mine', 60_000);
    const user = await User.findById('u1').lean();
    expect(user?.cooldowns?.mine).toBeInstanceOf(Date);
    expect(await cooldowns.expiry('u1', 'mine')).toBeInstanceOf(Date);
  });

  it('can be claimed again after it expires', async () => {
    await cooldowns.claim('u1', 'fish', 60_000);
    await User.updateOne({ _id: 'u1' }, { $set: { 'cooldowns.fish': new Date(Date.now() - 1000) } });
    expect((await cooldowns.claim('u1', 'fish', 60_000)).ok).toBe(true);
  });

  it('only one of many simultaneous claims succeeds', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => cooldowns.claim('spam', 'daily', 60_000)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('release lets it be claimed immediately', async () => {
    await cooldowns.claim('u1', 'work', 60_000);
    await cooldowns.release('u1', 'work');
    expect(await cooldowns.expiry('u1', 'work')).toBeNull();
    expect((await cooldowns.claim('u1', 'work', 60_000)).ok).toBe(true);
  });

  it('rejects unsafe keys', async () => {
    await expect(cooldowns.claim('u1', 'a.b', 1000)).rejects.toThrow();
    await expect(cooldowns.claim('u1', '$set', 1000)).rejects.toThrow();
  });
});

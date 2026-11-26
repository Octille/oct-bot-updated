import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from './helpers/db';
import { User } from '../src/models/User';
import { cleanupLegacyProfiles, legacyCleanupDue } from '../src/services/legacyCleanup';

describe('v2 profile cleanup (12 months after launch)', () => {
  useTestDatabase();
  const launch = '2026-12-01';

  it('is due only a full year after LAUNCH_DATE, and never without one', () => {
    expect(legacyCleanupDue(new Date('2027-11-30T23:59:00Z'), launch)).toBe(false);
    expect(legacyCleanupDue(new Date('2027-12-01T00:00:00Z'), launch)).toBe(true);
    expect(legacyCleanupDue(new Date('2030-01-01'), undefined)).toBe(false);
    expect(legacyCleanupDue(new Date('2030-01-01'), 'not a date')).toBe(false);
  });

  it('deletes v2 profiles never imported and keeps the imported ones', async () => {
    const v2 = mongoose.connection.db!.collection('profilemodels');
    await v2.insertMany([{ userID: 'kept' }, { userID: 'kept' }, { userID: 'dormant' }, { coins: 5 }]);
    await User.create({ _id: 'kept', wallet: 0 });
    expect(await cleanupLegacyProfiles(new Date('2027-06-01'), launch)).toBe(0);
    expect(await v2.countDocuments()).toBe(4);
    expect(await cleanupLegacyProfiles(new Date('2027-12-02'), launch)).toBe(2);
    expect((await v2.find().toArray()).map((d) => d.userID)).toEqual(['kept', 'kept']);
  });
});


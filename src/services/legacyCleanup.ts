import mongoose from 'mongoose';
import type { Document, WithId } from 'mongodb';
import { env } from '../config/env';
import { legacyCollections } from '../migration/v2';
import { User } from '../models/User';

/**
 * Privacy rule (docs/PRIVACY.md): old v2 profiles that nobody imported within 12 months of the
 * relaunch are deleted. Imported ones live on as v3 profiles. Runs daily; does nothing before then.
 */
export const legacyRetentionDays = 365;

export function legacyCleanupDue(now = new Date(), launch = env.LAUNCH_DATE): boolean {
  if (!launch) return false;
  const start = new Date(launch).getTime();
  return Number.isFinite(start) && now.getTime() >= start + legacyRetentionDays * 86_400_000;
}

/** Deletes every v2 profile document whose player has no v3 profile. Returns how many were deleted. */
export async function cleanupLegacyProfiles(now = new Date(), launch = env.LAUNCH_DATE): Promise<number> {
  if (!legacyCleanupDue(now, launch)) return 0;
  const profiles = mongoose.connection.db!.collection(legacyCollections.profiles);
  let deleted = 0;
  let batch: WithId<Document>[] = [];
  const flush = async () => {
    const ids = batch.map((d) => d.userID).filter((id): id is string => typeof id === 'string');
    const imported = new Set((await User.find({ _id: { $in: ids } }, { _id: 1 }, { lean: true })).map((u) => String(u._id)));
    const gone = batch.filter((d) => typeof d.userID !== 'string' || !imported.has(d.userID)).map((d) => d._id);
    if (gone.length) deleted += (await profiles.deleteMany({ _id: { $in: gone } })).deletedCount;
    batch = [];
  };
  for await (const doc of profiles.find({}, { projection: { userID: 1 } })) {
    batch.push(doc);
    if (batch.length >= 1_000) await flush();
  }
  if (batch.length) await flush();
  return deleted;
}

import mongoose, { type ClientSession } from 'mongoose';
import { Transaction } from '../models/Transaction';
import { User } from '../models/User';
import { convert, legacyCollections, mergeLegacy, MIGRATION_SOURCE, readLegacy, type Converted } from '../migration/v2';
import { refreshBoard } from './boardStats';

/**
 * Imports of v2 profiles. Only players with real activity are migrated up front
 * (scripts/migrate-v2-to-v3.ts); the rest stay in `profilemodels` and are imported the first time
 * anything creates their v3 profile (their own command, a lookup, a payment). Both use the same
 * conversion and the same insert below.
 */

/** The converted v2 profile for this user, or null when they never played v2. */
export async function findLegacy(userId: string, session?: ClientSession): Promise<Converted | null> {
  const docs = await mongoose.connection.db!
    .collection(legacyCollections.profiles)
    .find({ userID: userId }, { session })
    .toArray();
  if (docs.length === 0) return null;
  return convert(mergeLegacy(docs.map((d) => readLegacy(d))));
}

const DUPLICATE_KEY = 11000;

/**
 * Creates the v3 profile from a converted v2 one, in one atomic upsert, so two callers can't import
 * twice and nothing sent to the player is lost. Returns true when this call created it.
 */
export async function insertImported(userId: string, c: Converted, session?: ClientSession): Promise<boolean> {
  try {
    const res = await User.updateOne(
      { _id: userId },
      { $setOnInsert: c.fields },
      // The conversion sets createdAt itself (backdated for real v2 players)
      { upsert: true, session, timestamps: false },
    );
    if (!res.upsertedCount) return false;
  } catch (err) {
    if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err; // another request created it first
    return false;
  }
  await logImport(userId, c, session);
  await refreshBoard(userId, session);
  return true;
}

/** Logs the coins an import carried over, under its own source so /eco stats doesn't count them as income. */
async function logImport(userId: string, c: Converted, session?: ClientSession): Promise<void> {
  const rows = [
    ...(c.wallet ? [{ kind: 'wallet', delta: c.wallet }] : []),
    ...(c.bank ? [{ kind: 'bank', delta: c.bank }] : []),
  ].map((r) => ({ ...r, userId, source: MIGRATION_SOURCE, meta: { tier: c.tier, active: c.active, wagesPaid: c.wagesPaid } }));
  if (rows.length) await Transaction.insertMany(rows, { session });
}

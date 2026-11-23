/**
 * Play-testing helper: sets a profile's level and coins in the LOCAL dev database.
 *   npx tsx scripts/dev-set.ts --level 20 --wallet 500000 [--bank 0] [--user <discord id>]
 *   npx tsx scripts/dev-set.ts --veteran founder --reset-welcome   (grant a veteran tier; show the welcome-back again)
 *   npx tsx scripts/dev-set.ts --age-days 10                       (backdate the profile, for the 3-day anti-alt rule)
 * Defaults to OWNER_ID. Refuses to run against a hosted (Atlas) database.
 */
import mongoose from 'mongoose';
import { env, isRemoteMongo, resolveMongoUri } from '../src/config/env';
import { User } from '../src/models/User';
import { totalXpForLevel } from '../src/content/levels';
import { ensureUser } from '../src/services/economy';
import { grantVeteran } from '../src/services/veteran';
import { veteranTiers, type VeteranTier } from '../src/content/veteran';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const uri = resolveMongoUri();
  if (isRemoteMongo(uri)) throw new Error('dev-set only works on a local database.');
  const userId = arg('user') ?? env.OWNER_ID;
  const set: Record<string, number> = {};
  const level = arg('level');
  if (level !== undefined) Object.assign(set, { 'account.level': Number(level), 'account.xp': totalXpForLevel(Number(level)), 'account.best': Number(level) });
  if (arg('wallet') !== undefined) set.wallet = Number(arg('wallet'));
  if (arg('bank') !== undefined) set.bank = Number(arg('bank'));
  if (Object.values(set).some((v) => !Number.isSafeInteger(v) || v < 0)) throw new Error('Values must be whole numbers ≥ 0.');

  await mongoose.connect(uri);
  await ensureUser(userId);
  if (Object.keys(set).length) await User.updateOne({ _id: userId }, { $set: set });
  const tier = arg('veteran');
  if (tier !== undefined) {
    if (!veteranTiers.includes(tier as VeteranTier)) throw new Error(`--veteran must be one of ${veteranTiers.join(', ')}`);
    await grantVeteran(userId, tier as VeteranTier);
  }
  if (arg('age-days') !== undefined) {
    const days = Number(arg('age-days'));
    if (!Number.isFinite(days) || days < 0) throw new Error('--age-days must be a number ≥ 0');
    await User.collection.updateOne({ _id: userId as never }, { $set: { createdAt: new Date(Date.now() - days * 86_400_000) } });
  }
  if (process.argv.includes('--reset-welcome')) await User.updateOne({ _id: userId }, { $set: { 'veteran.welcomed': false } });
  const u = await User.findById(userId).lean();
  console.log(`${mongoose.connection.host}/${mongoose.connection.name} • ${userId}: level ${u?.account?.level}, wallet ${u?.wallet}, bank ${u?.bank}` +
    (u?.veteran?.tier ? ` • veteran ${u.veteran.tier} (welcome-back ${u.veteran.welcomed ? 'shown' : 'pending'}), badge ${u.cosmetics?.badge}, ${u.cosmetics?.owned?.length} cosmetics` : ''));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

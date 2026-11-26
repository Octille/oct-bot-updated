/**
 * v2 → v3 migration (PLAN.md §6, §9). Reads the v2 collections and never changes or deletes them.
 *
 *   npx tsx scripts/migrate-v2-to-v3.ts --uri mongodb://localhost:27017/octbot_v2copy --dry-run
 *   npx tsx scripts/migrate-v2-to-v3.ts --uri mongodb://localhost:27017/octbot_v2copy
 *   npx tsx scripts/migrate-v2-to-v3.ts --uri <atlas uri> --live --dry-run
 *   npx tsx scripts/migrate-v2-to-v3.ts --uri <atlas uri> --live --i-have-a-backup     (cutover only)
 *
 * Options: --json <file> also writes the summary as JSON.
 * A hosted (Atlas) database needs --live; writing to one also needs --i-have-a-backup.
 * Safe to re-run: anything already in v3 is skipped.
 */
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { isRemoteMongo } from '../src/config/env';
import { formatSummary, runMigration } from '../src/migration/run';

const has = (name: string) => process.argv.includes(`--${name}`);
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const uri = arg('uri');
  if (!uri) throw new Error('Pass --uri <mongodb uri>, e.g. a local copy: mongodb://localhost:27017/octbot_v2copy');
  const dryRun = has('dry-run');
  if (isRemoteMongo(uri)) {
    if (!has('live')) throw new Error('That is a hosted database. Run against a local copy, or pass --live if you really mean the live one.');
    if (!dryRun && !has('i-have-a-backup')) throw new Error('Writing to the live database needs a mongodump backup first; then pass --i-have-a-backup.');
  }

  mongoose.set('strictQuery', true);
  // No automatic index/collection builds: a dry run must not write anything, not even indexes
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, autoIndex: !dryRun, autoCreate: !dryRun });
  const { host, name } = mongoose.connection;
  console.log(`Connected to ${host}/${name}${dryRun ? ' (dry run)' : ''}`);
  const collections = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
  if (!collections.includes('profilemodels')) throw new Error(`No "profilemodels" collection in ${name}. Is this the right database?`);

  const summary = await runMigration({ dryRun, log: (line) => console.log(line) });
  console.log('\n' + formatSummary(summary));
  const json = arg('json');
  if (json) {
    writeFileSync(json, JSON.stringify(summary, null, 2));
    console.log(`\nSummary written to ${json}`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

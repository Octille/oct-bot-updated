/**
 * Uploads the rendered icons as application emojis (on the bot application, not a server).
 *   npx tsx scripts/icons/sync.ts            → uploads new/changed icons, removes stale ones
 *   npx tsx scripts/icons/sync.ts --dry-run  → shows what would change
 * Only runs for the test bot unless --force (the real bot gets its icons at the Phase 7 cutover).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REST, Routes } from 'discord.js';
import { env, isTestBot } from '../../src/config/env';
import { EMOJI_PREFIX, iconDefs } from '../../src/content/icons';

interface AppEmoji { id: string; name: string }

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  if (!isTestBot() && !args.includes('--force')) {
    throw new Error('This is not the test bot. Icons go to the real bot at the Phase 7 cutover; pass --force to override.');
  }
  const dir = join(__dirname, '..', '..', 'assets', 'icons');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, string>;
  const rest = new REST().setToken(env.DISCORD_TOKEN);
  const existing = ((await rest.get(Routes.applicationEmojis(env.CLIENT_ID))) as { items: AppEmoji[] }).items;
  const ours = existing.filter((e) => e.name.startsWith(EMOJI_PREFIX));

  const wanted = new Map(Object.keys(iconDefs).map((key) => [`${EMOJI_PREFIX}${key}_${manifest[key]}`, key]));
  const toUpload = [...wanted].filter(([name]) => !ours.some((e) => e.name === name));
  const toDelete = ours.filter((e) => !wanted.has(e.name));

  console.log(`${ours.length} icon emojis on the app • ${toUpload.length} to upload • ${toDelete.length} stale to remove${dry ? ' (dry run)' : ''}`);
  if (dry) return;

  for (const [name, key] of toUpload) {
    const image = `data:image/png;base64,${readFileSync(join(dir, `${key}.png`)).toString('base64')}`;
    await rest.post(Routes.applicationEmojis(env.CLIENT_ID), { body: { name, image } });
    console.log(`  ↑ ${name}`);
  }
  for (const e of toDelete) {
    await rest.delete(Routes.applicationEmoji(env.CLIENT_ID, e.id));
    console.log(`  ✕ ${e.name}`);
  }
  console.log('✅ Icons in sync. Restart the bot to pick up new emoji IDs.');
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

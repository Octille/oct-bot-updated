import { REST, Routes } from 'discord.js';
import { env } from './config/env';
import { commands } from './commands';

/**
 * Registers slash commands.
 *   npm run deploy:guild   → DEV_GUILD_ID only, updates instantly (development)
 *   npm run deploy:global  → every server, can take up to an hour to appear (production)
 */
async function main(): Promise<void> {
  const mode = process.argv.includes('--global') ? 'global' : 'guild';
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  if (mode === 'guild') {
    if (!env.DEV_GUILD_ID) throw new Error('Set DEV_GUILD_ID in .env to deploy to a single server.');
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), { body });
    console.log(`✅ Deployed ${body.length} command(s) to guild ${env.DEV_GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body });
    console.log(`✅ Deployed ${body.length} command(s) globally (may take up to an hour to show everywhere)`);
  }
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

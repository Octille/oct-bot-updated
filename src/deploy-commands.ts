import { REST, Routes } from 'discord.js';
import { devGuildIds, env, isTestBot } from './config/env';
import { commands } from './commands';

/**
 * Registers slash commands.
 *   npm run deploy:guild          → the servers in DEV_GUILD_IDS only, updates instantly (development)
 *   npm run deploy:global         → every server, can take up to an hour to appear (production).
 *                                   Refuses to run for the test bot unless you add -- --force.
 *   npm run deploy:global -- --clear   → removes all global commands
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.includes('--global') ? 'global' : 'guild';
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  if (mode === 'guild') {
    const guilds = devGuildIds();
    if (!guilds.length) throw new Error('Set DEV_GUILD_IDS (comma-separated) in .env to deploy to specific servers.');
    for (const guildId of guilds) {
      await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, guildId), { body });
      console.log(`✅ Deployed ${body.length} command(s) to guild ${guildId}`);
    }
    return;
  }

  if (args.includes('--clear')) {
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [] });
    console.log('✅ Removed all global commands');
    return;
  }
  if (isTestBot() && !args.includes('--force')) {
    throw new Error(
      'This is the test bot (CLIENT_ID matches TEST_CLIENT_ID). Global commands would appear in every server it joins.\n' +
      'Use `npm run deploy:guild` instead, or `npm run deploy:global -- --force` if you really mean it.',
    );
  }
  await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body });
  console.log(`✅ Deployed ${body.length} command(s) globally (may take up to an hour to show everywhere)`);
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

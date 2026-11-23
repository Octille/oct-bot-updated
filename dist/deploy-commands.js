"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const env_1 = require("./config/env");
const commands_1 = require("./commands");
/**
 * Registers slash commands.
 *   npm run deploy:guild   → DEV_GUILD_ID only, updates instantly (development)
 *   npm run deploy:global  → every server, can take up to an hour to appear (production)
 */
async function main() {
    const mode = process.argv.includes('--global') ? 'global' : 'guild';
    const body = commands_1.commands.map((c) => c.data.toJSON());
    const rest = new discord_js_1.REST().setToken(env_1.env.DISCORD_TOKEN);
    if (mode === 'guild') {
        if (!env_1.env.DEV_GUILD_ID)
            throw new Error('Set DEV_GUILD_ID in .env to deploy to a single server.');
        await rest.put(discord_js_1.Routes.applicationGuildCommands(env_1.env.CLIENT_ID, env_1.env.DEV_GUILD_ID), { body });
        console.log(`✅ Deployed ${body.length} command(s) to guild ${env_1.env.DEV_GUILD_ID}`);
    }
    else {
        await rest.put(discord_js_1.Routes.applicationCommands(env_1.env.CLIENT_ID), { body });
        console.log(`✅ Deployed ${body.length} command(s) globally (may take up to an hour to show everywhere)`);
    }
}
main().catch((err) => {
    console.error('❌ Deploy failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
//# sourceMappingURL=deploy-commands.js.map
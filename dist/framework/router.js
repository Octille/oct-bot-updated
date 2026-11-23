"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeInteraction = routeInteraction;
const discord_js_1 = require("discord.js");
const env_1 = require("../config/env");
const errors_1 = require("../lib/errors");
const customId_1 = require("../lib/customId");
const format_1 = require("../lib/format");
const logger_1 = require("../lib/logger");
const economy_1 = require("../services/economy");
const cooldowns = __importStar(require("../services/cooldowns"));
const registry_1 = require("./registry");
const respond_1 = require("./respond");
/** How long to wait before telling someone a collector-managed button has expired. */
const EXPIRED_GRACE_MS = 2_500;
async function routeInteraction(interaction) {
    if (interaction.isChatInputCommand())
        return runCommand(interaction);
    if (interaction.isAutocomplete()) {
        const command = registry_1.commandRegistry.get(interaction.commandName);
        await command?.autocomplete?.(interaction).catch((err) => (0, logger_1.logError)(`autocomplete /${interaction.commandName}`, err));
        return;
    }
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
        return runComponent(interaction);
    }
}
async function runCommand(interaction) {
    const command = registry_1.commandRegistry.get(interaction.commandName);
    if (!command)
        return (0, respond_1.respondError)(interaction, 'That command no longer exists.');
    let claimedCooldown = false;
    try {
        if (command.guildOnly && !interaction.inGuild())
            throw new errors_1.UserError('That command only works in a server.');
        if (command.ownerOnly && interaction.user.id !== env_1.env.OWNER_ID)
            throw new errors_1.UserError('Only the bot owner can use that.');
        if (command.defer) {
            await interaction.deferReply(command.defer === 'ephemeral' ? { flags: discord_js_1.MessageFlags.Ephemeral } : {});
        }
        const profile = await (0, economy_1.loadProfile)(interaction.user.id);
        if (command.blockedInJail && profile.jailUntil && profile.jailUntil.getTime() > Date.now()) {
            throw new errors_1.UserError(`🚔 You're in jail. You'll be released ${(0, format_1.relative)(profile.jailUntil)}.`);
        }
        if (command.cooldown) {
            const result = await cooldowns.claim(interaction.user.id, command.cooldown.key, command.cooldown.seconds * 1000);
            if (!result.ok) {
                throw new errors_1.UserError(`⏳ \`/${command.data.name}\` is on cooldown for **${(0, format_1.duration)(result.remainingMs)}** (${(0, format_1.relative)(result.expiresAt)}).`);
            }
            claimedCooldown = true;
        }
        await command.execute({ interaction, client: interaction.client, profile });
    }
    catch (err) {
        if (claimedCooldown && command.cooldown) {
            await cooldowns.release(interaction.user.id, command.cooldown.key).catch(() => undefined);
        }
        if (err instanceof errors_1.UserError)
            return (0, respond_1.respondError)(interaction, err.message);
        (0, logger_1.logError)(`/${interaction.commandName}`, err);
        return (0, respond_1.respondError)(interaction, 'Something went wrong running that command. It has been reported.');
    }
}
async function runComponent(interaction) {
    const id = (0, customId_1.parseId)(interaction.customId);
    if (id.ownerId !== customId_1.ANYONE && id.ownerId !== interaction.user.id) {
        await interaction.reply({ content: "🚫 This isn't yours.", flags: discord_js_1.MessageFlags.Ephemeral }).catch(() => undefined);
        return;
    }
    // Collector-managed components (`~prefix`) are handled by the collector that created them.
    // If nothing answers within the grace period, the collector is gone (ended or bot restarted).
    if (id.prefix.startsWith('~')) {
        setTimeout(() => {
            if (interaction.replied || interaction.deferred)
                return;
            interaction
                .reply({ content: '⌛ This has expired. Run the command again.', flags: discord_js_1.MessageFlags.Ephemeral })
                .catch(() => undefined);
        }, EXPIRED_GRACE_MS);
        return;
    }
    const handler = registry_1.componentRegistry.get(id.prefix);
    if (!handler) {
        await interaction.reply({ content: '⌛ This has expired.', flags: discord_js_1.MessageFlags.Ephemeral }).catch(() => undefined);
        return;
    }
    try {
        const profile = await (0, economy_1.loadProfile)(interaction.user.id);
        await handler.execute({ interaction, client: interaction.client, id, profile });
    }
    catch (err) {
        if (err instanceof errors_1.UserError)
            return (0, respond_1.respondError)(interaction, err.message);
        (0, logger_1.logError)(`component ${id.prefix}`, err);
        return (0, respond_1.respondError)(interaction, 'Something went wrong. It has been reported.');
    }
}
//# sourceMappingURL=router.js.map
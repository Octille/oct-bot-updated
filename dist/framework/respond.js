"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.respond = respond;
exports.respondError = respondError;
const discord_js_1 = require("discord.js");
const embeds_1 = require("../lib/embeds");
/** Replies whether or not the interaction was already deferred/replied. */
async function respond(interaction, payload) {
    if (interaction.deferred && !interaction.replied) {
        const { flags: _flags, ...rest } = payload;
        await interaction.editReply(rest);
    }
    else if (interaction.replied) {
        await interaction.followUp(payload);
    }
    else {
        await interaction.reply(payload);
    }
}
/** An ephemeral error reply (or an edit of the deferred reply). */
async function respondError(interaction, message) {
    await respond(interaction, { embeds: [(0, embeds_1.errorEmbed)(message)], flags: discord_js_1.MessageFlags.Ephemeral }).catch(() => undefined);
}
//# sourceMappingURL=respond.js.map
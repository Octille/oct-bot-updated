"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disabledRows = disabledRows;
exports.disableComponents = disableComponents;
const discord_js_1 = require("discord.js");
/** Copies a message's component rows with every button and select menu disabled. */
function disabledRows(rows) {
    return rows.map((row) => {
        const first = row.components[0];
        if (first?.type === discord_js_1.ComponentType.StringSelect) {
            return new discord_js_1.ActionRowBuilder().addComponents(row.components.map((c) => discord_js_1.StringSelectMenuBuilder.from(c).setDisabled(true)));
        }
        return new discord_js_1.ActionRowBuilder().addComponents(row.components
            .filter((c) => c.type === discord_js_1.ComponentType.Button)
            .map((c) => discord_js_1.ButtonBuilder.from(c).setDisabled(true)));
    });
}
/** Disables all components on a message (used when a collector ends). Ignores deleted messages. */
async function disableComponents(message) {
    if (!message.components.length)
        return;
    const rows = message.components.filter((r) => r.type === discord_js_1.ComponentType.ActionRow);
    await message.edit({ components: disabledRows(rows) }).catch(() => undefined);
}
//# sourceMappingURL=components.js.map
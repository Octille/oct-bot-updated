"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.palette = void 0;
exports.embed = embed;
exports.successEmbed = successEmbed;
exports.errorEmbed = errorEmbed;
exports.warningEmbed = warningEmbed;
const discord_js_1 = require("discord.js");
exports.palette = {
    economy: 0xf1c40f,
    gambling: 0x9b59b6,
    social: 0xe91e63,
    levels: 0x3498db,
    events: 0xe67e22,
    music: 0x1db954,
    moderation: 0xe74c3c,
    utility: 0x95a5a6,
    success: 0x2ecc71,
    error: 0xed4245,
    warning: 0xfee75c,
};
function embed(category = 'utility') {
    return new discord_js_1.EmbedBuilder().setColor(exports.palette[category]);
}
function successEmbed(description) {
    return embed('success').setDescription(`✅ ${description}`);
}
function errorEmbed(description) {
    return embed('error').setDescription(`❌ ${description}`);
}
function warningEmbed(description) {
    return embed('warning').setDescription(`⚠️ ${description}`);
}
//# sourceMappingURL=embeds.js.map
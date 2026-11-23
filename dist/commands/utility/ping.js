"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const mongoose_1 = __importDefault(require("mongoose"));
const types_1 = require("../../framework/types");
const embeds_1 = require("../../lib/embeds");
exports.default = (0, types_1.defineCommand)({
    data: new discord_js_1.SlashCommandBuilder().setName('ping').setDescription("Check the bot's latency"),
    category: 'utility',
    async execute({ interaction, client }) {
        const started = Date.now();
        await mongoose_1.default.connection.db?.admin().ping();
        const dbMs = Date.now() - started;
        const roundTrip = Date.now() - interaction.createdTimestamp;
        await interaction.reply({
            embeds: [
                (0, embeds_1.embed)('utility')
                    .setTitle('🏓 Pong!')
                    .addFields({ name: 'Round trip', value: `${roundTrip}ms`, inline: true }, { name: 'Gateway', value: `${Math.round(client.ws.ping)}ms`, inline: true }, { name: 'Database', value: `${dbMs}ms`, inline: true }),
            ],
        });
    },
});
//# sourceMappingURL=ping.js.map
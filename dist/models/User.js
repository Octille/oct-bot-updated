"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const economy_1 = require("../content/economy");
/** One global profile per Discord user. Stored in `players` so it never collides with v2's `profilemodels`. */
const userSchema = new mongoose_1.Schema({
    _id: { type: String, required: true }, // Discord user id
    wallet: { type: Number, default: economy_1.economyConfig.startingWallet, min: 0 },
    bank: { type: Number, default: 0, min: 0 },
    bankNotes: { type: Number, default: 0, min: 0 },
    account: {
        xp: { type: Number, default: 0, min: 0 },
        level: { type: Number, default: 0, min: 0 },
        prestige: { type: Number, default: 0, min: 0 },
    },
    /** itemId → quantity */
    inventory: { type: Map, of: Number, default: () => new Map() },
    /** cooldown key → time it expires */
    cooldowns: { type: Map, of: Date, default: () => new Map() },
    jailUntil: { type: Date, default: null },
    lastActiveAt: { type: Date, default: () => new Date() },
    settings: {
        dmReminders: { type: Boolean, default: false },
    },
    migratedFromV2: { type: Boolean, default: false },
}, { collection: 'players', timestamps: true, versionKey: false });
exports.User = (0, mongoose_1.model)('User', userSchema);
//# sourceMappingURL=User.js.map
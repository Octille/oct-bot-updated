"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.economyConfig = void 0;
exports.bankCapacity = bankCapacity;
/**
 * Core economy numbers. Every tunable value lives in src/content so balancing is a config edit.
 * BALANCE.md explains the intended earning rates these are tuned for.
 */
exports.economyConfig = {
    startingWallet: 1_000,
    bank: {
        /** Capacity at account level 0. */
        base: 25_000,
        /** Extra capacity per account level. */
        perLevel: 5_000,
        /** Extra capacity per bank note used. */
        perNote: 10_000,
    },
    /** Fraction of a /give that is destroyed (coin sink). */
    transferTax: 0.05,
};
/** Bank capacity for a given account level and number of bank notes used. */
function bankCapacity(level, bankNotes) {
    const { base, perLevel, perNote } = exports.economyConfig.bank;
    return base + level * perLevel + bankNotes * perNote;
}
//# sourceMappingURL=economy.js.map
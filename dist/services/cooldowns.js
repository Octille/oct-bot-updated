"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claim = claim;
exports.expiry = expiry;
exports.release = release;
const User_1 = require("../models/User");
const economy_1 = require("./economy");
/**
 * Persistent cooldowns stored on the profile (`cooldowns.<key>` = expiry time).
 * Claiming is a single conditional update, so double-clicks and restarts can't double-claim.
 */
const KEY = /^[a-z0-9_-]+$/i;
function pathFor(key) {
    if (!KEY.test(key))
        throw new Error(`Invalid cooldown key "${key}"`);
    return `cooldowns.${key}`;
}
/** Starts the cooldown if it isn't running. Returns when it will (or already does) expire. */
async function claim(userId, key, durationMs, session) {
    const path = pathFor(key);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    await (0, economy_1.ensureUser)(userId, session);
    const claimed = await User_1.User.findOneAndUpdate({ _id: userId, $or: [{ [path]: { $exists: false } }, { [path]: null }, { [path]: { $lte: now } }] }, { $set: { [path]: expiresAt } }, { new: true, session, projection: { _id: 1 } });
    if (claimed)
        return { ok: true, expiresAt };
    const running = await expiry(userId, key, session);
    const until = running ?? expiresAt;
    return { ok: false, expiresAt: until, remainingMs: Math.max(0, until.getTime() - now.getTime()) };
}
/** When the cooldown expires, or null if it isn't running. */
async function expiry(userId, key, session) {
    const user = await User_1.User.findById(userId, { [pathFor(key)]: 1 }, { session, lean: true });
    const value = user?.cooldowns?.[key];
    return value && value.getTime() > Date.now() ? value : null;
}
/** Cancels a cooldown, e.g. when the command failed after claiming it. */
async function release(userId, key, session) {
    await User_1.User.updateOne({ _id: userId }, { $unset: { [pathFor(key)]: '' } }, { session });
}
//# sourceMappingURL=cooldowns.js.map
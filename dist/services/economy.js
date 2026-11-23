"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.capacityOf = capacityOf;
exports.ensureUser = ensureUser;
exports.loadProfile = loadProfile;
exports.getProfile = getProfile;
exports.apply = apply;
exports.inTransaction = inTransaction;
exports.addCoins = addCoins;
exports.removeCoins = removeCoins;
exports.addItem = addItem;
exports.removeItem = removeItem;
exports.deposit = deposit;
exports.withdraw = withdraw;
exports.transfer = transfer;
exports.settle = settle;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Transaction_1 = require("../models/Transaction");
const errors_1 = require("../lib/errors");
const format_1 = require("../lib/format");
const economy_1 = require("../content/economy");
const ITEM_ID = /^[a-z0-9_]+$/;
const DUPLICATE_KEY = 11000;
function assertWhole(n, label) {
    if (!Number.isSafeInteger(n))
        throw new errors_1.EconomyError('INVALID_AMOUNT', `${label} must be a whole number.`);
}
function assertPositive(n, label = 'Amount') {
    assertWhole(n, label);
    if (n <= 0)
        throw new errors_1.EconomyError('INVALID_AMOUNT', `${label} must be more than zero.`);
}
/** Bank capacity computed inside MongoDB, so the cap check is part of the atomic update. */
const bankCapExpr = {
    $add: [
        economy_1.economyConfig.bank.base,
        { $multiply: [{ $ifNull: ['$account.level', 0] }, economy_1.economyConfig.bank.perLevel] },
        { $multiply: [{ $ifNull: ['$bankNotes', 0] }, economy_1.economyConfig.bank.perNote] },
    ],
};
function capacityOf(user) {
    return (0, economy_1.bankCapacity)(user.account?.level ?? 0, user.bankNotes ?? 0);
}
function isDuplicateKey(err) {
    return typeof err === 'object' && err !== null && err.code === DUPLICATE_KEY;
}
/** Creates the profile if it doesn't exist. Safe to call concurrently. */
async function ensureUser(userId, session) {
    try {
        await User_1.User.updateOne({ _id: userId }, { $setOnInsert: { _id: userId } }, { upsert: true, session });
    }
    catch (err) {
        if (!isDuplicateKey(err))
            throw err; // another request created it first
    }
}
/**
 * Loads (creating silently if needed) a profile and marks the user as active.
 * Used by the interaction wrapper for every command and button press.
 */
async function loadProfile(userId) {
    const run = () => User_1.User.findOneAndUpdate({ _id: userId }, { $setOnInsert: { _id: userId }, $set: { lastActiveAt: new Date() } }, { upsert: true, new: true, lean: true });
    let user;
    try {
        user = await run();
    }
    catch (err) {
        if (!isDuplicateKey(err))
            throw err;
        user = await run(); // another request created it first
    }
    if (!user)
        throw new errors_1.EconomyError('NO_PROFILE', 'Could not load your profile.');
    return user;
}
async function getProfile(userId, session) {
    await ensureUser(userId, session);
    const user = await User_1.User.findById(userId, null, { session, lean: true });
    if (!user)
        throw new errors_1.EconomyError('NO_PROFILE', 'Profile not found.');
    return user;
}
/** Works out which guard made a conditional update fail, for a helpful error message. */
async function explainFailure(userId, change, session) {
    const user = await User_1.User.findById(userId, null, { session, lean: true });
    if (!user)
        return new errors_1.EconomyError('NO_PROFILE', 'Profile not found.');
    if (change.wallet && change.wallet < 0 && user.wallet < -change.wallet) {
        return new errors_1.EconomyError('INSUFFICIENT_WALLET', `You need ${(0, format_1.coins)(-change.wallet)} in your wallet but only have ${(0, format_1.coins)(user.wallet)}.`);
    }
    if (change.bank && change.bank < 0 && user.bank < -change.bank) {
        return new errors_1.EconomyError('INSUFFICIENT_BANK', `You need ${(0, format_1.coins)(-change.bank)} in your bank but only have ${(0, format_1.coins)(user.bank)}.`);
    }
    if (change.bank && change.bank > 0) {
        const cap = capacityOf(user);
        if (user.bank + change.bank > cap) {
            return new errors_1.EconomyError('BANK_FULL', `Your bank can only hold ${(0, format_1.coins)(cap)} (it has ${(0, format_1.coins)(user.bank)}). Level up or use a bank note to raise the limit.`);
        }
    }
    const inventory = user.inventory ?? {};
    for (const [itemId, qty] of Object.entries(change.items ?? {})) {
        if (qty < 0 && (inventory[itemId] ?? 0) < -qty) {
            return new errors_1.EconomyError('INSUFFICIENT_ITEMS', `You need ${-qty}× \`${itemId}\` but only have ${inventory[itemId] ?? 0}.`);
        }
    }
    // Nothing obviously wrong: the balance changed between the update and this check.
    return new errors_1.EconomyError('INSUFFICIENT_WALLET', 'Your balance changed while that was happening. Try again.');
}
/**
 * Applies a change to one user atomically. Throws EconomyError (and changes nothing) if any
 * part of it can't be afforded. Returns the updated profile.
 */
async function apply(userId, change, opts) {
    const filter = { _id: userId };
    const inc = {};
    const rows = [];
    if (change.wallet) {
        assertWhole(change.wallet, 'Wallet change');
        inc.wallet = change.wallet;
        if (change.wallet < 0)
            filter.wallet = { $gte: -change.wallet };
        rows.push({ kind: 'wallet', delta: change.wallet });
    }
    if (change.bank) {
        assertWhole(change.bank, 'Bank change');
        inc.bank = change.bank;
        if (change.bank < 0)
            filter.bank = { $gte: -change.bank };
        else
            filter.$expr = { $lte: [{ $add: ['$bank', change.bank] }, bankCapExpr] };
        rows.push({ kind: 'bank', delta: change.bank });
    }
    const zeroed = [];
    for (const [itemId, qty] of Object.entries(change.items ?? {})) {
        if (!ITEM_ID.test(itemId))
            throw new Error(`Invalid item id "${itemId}"`);
        assertWhole(qty, 'Item quantity');
        if (qty === 0)
            continue;
        const path = `inventory.${itemId}`;
        inc[path] = qty;
        if (qty < 0) {
            filter[path] = { $gte: -qty };
            zeroed.push(path);
        }
        rows.push({ kind: 'item', itemId, delta: qty });
    }
    await ensureUser(userId, opts.session);
    if (rows.length === 0)
        return getProfile(userId, opts.session);
    const updated = await User_1.User.findOneAndUpdate(filter, { $inc: inc }, { new: true, session: opts.session, lean: true });
    if (!updated)
        throw await explainFailure(userId, change, opts.session);
    // Remove items that reached zero so inventories stay tidy
    for (const path of zeroed) {
        await User_1.User.updateOne({ _id: userId, [path]: 0 }, { $unset: { [path]: '' } }, { session: opts.session });
    }
    if (!opts.skipLog) {
        await Transaction_1.Transaction.insertMany(rows.map((r) => ({ ...r, userId, source: opts.source, meta: opts.meta, transfer: opts.transfer ?? false })), { session: opts.session });
    }
    return updated;
}
/** Runs `fn` in a Mongo transaction; everything inside commits or rolls back together. */
async function inTransaction(fn) {
    const session = await mongoose_1.default.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await fn(session);
        });
        return result;
    }
    finally {
        await session.endSession();
    }
}
async function addCoins(userId, amount, opts) {
    assertPositive(amount);
    return apply(userId, { wallet: amount }, opts);
}
async function removeCoins(userId, amount, opts) {
    assertPositive(amount);
    return apply(userId, { wallet: -amount }, opts);
}
async function addItem(userId, itemId, qty, opts) {
    assertPositive(qty, 'Quantity');
    return apply(userId, { items: { [itemId]: qty } }, opts);
}
async function removeItem(userId, itemId, qty, opts) {
    assertPositive(qty, 'Quantity');
    return apply(userId, { items: { [itemId]: -qty } }, opts);
}
/** Moves coins wallet → bank, up to the bank's capacity. `all` deposits as much as fits. */
async function deposit(userId, request) {
    for (let attempt = 0;; attempt++) {
        const user = await getProfile(userId);
        const room = capacityOf(user) - user.bank;
        const amount = request === 'all' ? Math.min(user.wallet, room) : request;
        if (request === 'all' && user.wallet <= 0)
            throw new errors_1.EconomyError('INSUFFICIENT_WALLET', 'Your wallet is empty.');
        if (request === 'all' && room <= 0)
            throw new errors_1.EconomyError('BANK_FULL', `Your bank is full (${(0, format_1.coins)(capacityOf(user))}).`);
        assertPositive(amount);
        try {
            const profile = await apply(userId, { wallet: -amount, bank: amount }, { source: 'bank.deposit', transfer: true });
            return { amount, profile };
        }
        catch (err) {
            // With `all` the balance may have changed underneath us; recompute and retry
            if (request !== 'all' || !(err instanceof errors_1.EconomyError) || attempt >= 2)
                throw err;
        }
    }
}
/** Moves coins bank → wallet. `all` withdraws everything. */
async function withdraw(userId, request) {
    for (let attempt = 0;; attempt++) {
        const user = await getProfile(userId);
        const amount = request === 'all' ? user.bank : request;
        if (request === 'all' && user.bank <= 0)
            throw new errors_1.EconomyError('INSUFFICIENT_BANK', 'Your bank is empty.');
        assertPositive(amount);
        try {
            const profile = await apply(userId, { wallet: amount, bank: -amount }, { source: 'bank.withdraw', transfer: true });
            return { amount, profile };
        }
        catch (err) {
            if (request !== 'all' || !(err instanceof errors_1.EconomyError) || attempt >= 2)
                throw err;
        }
    }
}
/**
 * Sends wallet coins from one player to another, with an optional tax that is destroyed.
 * Both sides commit together or not at all.
 */
async function transfer(fromId, toId, amount, opts) {
    assertPositive(amount);
    if (fromId === toId)
        throw new errors_1.EconomyError('SELF_TRANSFER', "You can't send coins to yourself.");
    const tax = Math.floor(amount * (opts.taxRate ?? 0));
    const received = amount - tax;
    await inTransaction(async (session) => {
        await apply(fromId, { wallet: -amount }, { source: opts.source, session, skipLog: true });
        if (received > 0)
            await apply(toId, { wallet: received }, { source: opts.source, session, skipLog: true });
        const meta = { ...opts.meta, from: fromId, to: toId };
        const rows = [
            { userId: fromId, kind: 'wallet', delta: -received, source: opts.source, transfer: true, meta },
            { userId: toId, kind: 'wallet', delta: received, source: opts.source, transfer: true, meta },
        ];
        if (tax > 0)
            rows.push({ userId: fromId, kind: 'wallet', delta: -tax, source: `${opts.source}.tax`, transfer: false, meta });
        await Transaction_1.Transaction.insertMany(rows.filter((r) => r.delta !== 0), { session });
    });
    return { sent: amount, received, tax };
}
/**
 * Applies several players' changes in one transaction (trades, duels, heist payouts, robberies).
 * If any player can't afford their part, nothing happens.
 */
async function settle(entries, opts) {
    return inTransaction(async (session) => {
        const results = [];
        for (const entry of entries) {
            results.push(await apply(entry.userId, entry.change, {
                source: entry.source ?? opts.source,
                meta: opts.meta,
                transfer: entry.transfer,
                session,
            }));
        }
        return results;
    });
}
//# sourceMappingURL=economy.js.map
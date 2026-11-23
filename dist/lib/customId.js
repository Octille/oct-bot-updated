"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANYONE = void 0;
exports.makeId = makeId;
exports.parseId = parseId;
/**
 * Component custom IDs look like `prefix:ownerId:arg1:arg2`.
 * `ownerId` is the only user allowed to press it, or `*` for anyone.
 */
exports.ANYONE = '*';
function makeId(prefix, ownerId, ...args) {
    const id = [prefix, ownerId, ...args.map(String)].join(':');
    if (id.length > 100)
        throw new Error(`customId too long (${id.length}): ${id}`);
    if (args.some((a) => String(a).includes(':')))
        throw new Error(`customId args can't contain ":" (${id})`);
    return id;
}
function parseId(customId) {
    const [prefix = '', ownerId = exports.ANYONE, ...args] = customId.split(':');
    return { prefix, ownerId, args };
}
//# sourceMappingURL=customId.js.map
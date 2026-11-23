"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRng = void 0;
exports.seededRng = seededRng;
exports.randInt = randInt;
exports.chance = chance;
exports.pick = pick;
exports.weighted = weighted;
exports.shuffle = shuffle;
exports.defaultRng = { next: Math.random };
/** Deterministic generator (mulberry32) for tests and replayable rolls. */
function seededRng(seed) {
    let a = seed >>> 0;
    return {
        next() {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
        },
    };
}
/** Integer in [min, max] inclusive. */
function randInt(min, max, rng = exports.defaultRng) {
    return min + Math.floor(rng.next() * (max - min + 1));
}
function chance(probability, rng = exports.defaultRng) {
    return rng.next() < probability;
}
function pick(items, rng = exports.defaultRng) {
    if (items.length === 0)
        throw new Error('pick() from an empty list');
    return items[Math.floor(rng.next() * items.length)];
}
/** Weighted pick; weights don't need to sum to 1. */
function weighted(items, weightOf, rng = exports.defaultRng) {
    const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
    if (total <= 0)
        throw new Error('weighted() needs at least one positive weight');
    let roll = rng.next() * total;
    for (const item of items) {
        roll -= Math.max(0, weightOf(item));
        if (roll < 0)
            return item;
    }
    return items[items.length - 1];
}
function shuffle(items, rng = exports.defaultRng) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
//# sourceMappingURL=rng.js.map
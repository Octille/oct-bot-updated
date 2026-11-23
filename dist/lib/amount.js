"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAmount = parseAmount;
const SUFFIX = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
/**
 * Parses a user-typed amount against what they actually have.
 * Accepts `all`, `max`, `half`, `25%`, `1k`, `2.5m`, `1,000`, `500`.
 * The result is only a request — services re-check it atomically against the database.
 */
function parseAmount(input, available, min = 1) {
    const text = input.trim().toLowerCase().replace(/[,_\s]/g, '');
    let value;
    if (text === 'all' || text === 'max')
        value = available;
    else if (text === 'half')
        value = Math.floor(available / 2);
    else if (/^\d+(\.\d+)?%$/.test(text)) {
        const pct = Number(text.slice(0, -1));
        if (pct <= 0 || pct > 100)
            return { ok: false, reason: 'Percentages must be between 1% and 100%.' };
        value = Math.floor((available * pct) / 100);
    }
    else {
        const match = /^(\d+(?:\.\d+)?)([kmbt])?$/.exec(text);
        if (!match)
            return { ok: false, reason: `\`${input}\` isn't a valid amount. Try \`500\`, \`2.5k\`, \`half\` or \`all\`.` };
        value = Math.floor(Number(match[1]) * (match[2] ? SUFFIX[match[2]] : 1));
    }
    if (!Number.isSafeInteger(value))
        return { ok: false, reason: 'That number is too big.' };
    if (value < min) {
        return available < min && ['all', 'max', 'half'].includes(text)
            ? { ok: false, reason: "You don't have enough for that." }
            : { ok: false, reason: `The minimum is ${min.toLocaleString('en-US')}.` };
    }
    if (value > available)
        return { ok: false, reason: `You only have ${available.toLocaleString('en-US')}.` };
    return { ok: true, value };
}
//# sourceMappingURL=amount.js.map
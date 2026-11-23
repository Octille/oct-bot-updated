"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENCY_SYMBOL = exports.CURRENCY = void 0;
exports.coins = coins;
exports.num = num;
exports.plural = plural;
exports.duration = duration;
exports.relative = relative;
exports.bar = bar;
exports.CURRENCY = 'Octs';
exports.CURRENCY_SYMBOL = '₪';
/** `₪ 1,234` */
function coins(n) {
    return `${exports.CURRENCY_SYMBOL} ${Math.trunc(n).toLocaleString('en-US')}`;
}
function num(n) {
    return n.toLocaleString('en-US');
}
function plural(n, word, pluralWord = `${word}s`) {
    return `${num(n)} ${n === 1 ? word : pluralWord}`;
}
/** `2h 5m`, `45s` — at most two units. */
function duration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const units = [['d', 86_400], ['h', 3_600], ['m', 60], ['s', 1]];
    const parts = [];
    let rest = total;
    for (const [label, size] of units) {
        const value = Math.floor(rest / size);
        if (value > 0)
            parts.push(`${value}${label}`);
        rest %= size;
        if (parts.length === 2)
            break;
    }
    return parts.join(' ') || '0s';
}
/** Discord relative timestamp, e.g. "in 5 minutes". */
function relative(date) {
    return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}
/** `[██████░░░░]` */
function bar(value, max, length = 10) {
    const filled = max > 0 ? Math.min(length, Math.max(0, Math.round((value / max) * length))) : 0;
    return `\`[${'█'.repeat(filled)}${'░'.repeat(length - filled)}]\``;
}
//# sourceMappingURL=format.js.map
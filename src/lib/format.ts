export const CURRENCY = 'Octs';
export const CURRENCY_SYMBOL = '₪';

/** `₪ 1,234` */
export function coins(n: number): string {
  return `${CURRENCY_SYMBOL} ${Math.trunc(n).toLocaleString('en-US')}`;
}

export function num(n: number): string {
  return n.toLocaleString('en-US');
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${num(n)} ${n === 1 ? word : pluralWord}`;
}

/** `2h 5m`, `45s` — at most two units. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const units: [string, number][] = [['d', 86_400], ['h', 3_600], ['m', 60], ['s', 1]];
  const parts: string[] = [];
  let rest = total;
  for (const [label, size] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) parts.push(`${value}${label}`);
    rest %= size;
    if (parts.length === 2) break;
  }
  return parts.join(' ') || '0s';
}

/** Discord relative timestamp, e.g. "in 5 minutes". */
export function relative(date: Date | number): string {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}

/** `▰▰▰▰▰▰▰▱▱▱` — plain text (no code block), so it reads cleanly in light and dark mode. */
export function bar(value: number, max: number, length = 10): string {
  const filled = max > 0 ? Math.min(length, Math.max(0, Math.round((value / max) * length))) : 0;
  return `${'▰'.repeat(filled)}${'▱'.repeat(length - filled)}`;
}

/**
 * Time left for cooldown buttons and status lines: whole units, rounded up, no seconds.
 * "1m", "10m", "17h 45m", "6d 19h".
 */
export function timeLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const hours = Math.ceil(ms / 3_600_000);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/lib/amount';

const ok = (input: string, available: number) => {
  const r = parseAmount(input, available);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('parseAmount', () => {
  it('parses plain numbers, commas and suffixes', () => {
    expect(ok('500', 10_000)).toBe(500);
    expect(ok('1,000', 10_000)).toBe(1_000);
    expect(ok('1k', 10_000)).toBe(1_000);
    expect(ok('2.5k', 10_000)).toBe(2_500);
    expect(ok('2.5M', 5_000_000)).toBe(2_500_000);
    expect(ok('1b', 2e9)).toBe(1_000_000_000);
  });

  it('parses all, max, half and percentages against the available amount', () => {
    expect(ok('all', 1234)).toBe(1234);
    expect(ok('max', 1234)).toBe(1234);
    expect(ok('half', 1235)).toBe(617);
    expect(ok('25%', 1000)).toBe(250);
  });

  it('rejects amounts above what is available', () => {
    expect(parseAmount('2k', 1500)).toMatchObject({ ok: false });
  });

  it('rejects zero, negatives, junk and absurd numbers', () => {
    for (const bad of ['0', '-5', 'abc', '1.2.3', '5kk', '0%', '150%', 'NaN', 'Infinity', '1e5', '9999999999999t']) {
      expect(parseAmount(bad, Number.MAX_SAFE_INTEGER).ok, bad).toBe(false);
    }
  });

  it('rejects all/half when there is nothing to use', () => {
    expect(parseAmount('all', 0)).toMatchObject({ ok: false, reason: "You don't have enough for that." });
    expect(parseAmount('half', 1)).toMatchObject({ ok: false });
  });

  it('enforces a minimum', () => {
    expect(parseAmount('50', 1000, 100)).toMatchObject({ ok: false });
    expect(parseAmount('100', 1000, 100)).toEqual({ ok: true, value: 100 });
  });
});

import { describe, expect, it } from 'vitest';
import { ANYONE, makeId, parseId } from '../src/lib/customId';

describe('customId', () => {
  it('round-trips prefix, owner and args', () => {
    const id = makeId('bj', '123', 'hit', 5);
    expect(id).toBe('bj:123:hit:5');
    expect(parseId(id)).toEqual({ prefix: 'bj', ownerId: '123', args: ['hit', '5'] });
  });

  it('supports anyone-can-press components', () => {
    expect(parseId(makeId('drop', ANYONE)).ownerId).toBe(ANYONE);
  });

  it('rejects ids that are too long or contain separators in args', () => {
    expect(() => makeId('x', '1', 'a'.repeat(100))).toThrow();
    expect(() => makeId('x', '1', 'a:b')).toThrow();
  });
});

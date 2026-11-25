import { describe, expect, it } from 'vitest';
import { isPremium, isPremiumServer } from '../src/services/premium';

describe('premium', () => {
  it('is off for everyone until Phase 8 is chosen', () => {
    expect(isPremium({ _id: '1' })).toBe(false);
    expect(isPremiumServer({ guildId: '1' })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './helpers/db';
import { cosmetics, shopCosmetics } from '../src/content/cosmetics';
import { veteranCosmetics } from '../src/content/veteran';
import { claimVeteranWelcome, grantVeteran } from '../src/services/veteran';
import { getProfile } from '../src/services/economy';
import { titled } from '../src/lib/theme';

describe('veteran set (content)', () => {
  it('exclusives are never sold', () => {
    const exclusive = cosmetics.filter((c) => c.exclusive);
    expect(exclusive.length).toBe(9);
    for (const c of shopCosmetics()) expect(c.exclusive).toBeUndefined();
    for (const c of exclusive) expect(c.rotationOnly).toBeFalsy();
  });

  it('each tier includes the tiers below it', () => {
    expect(veteranCosmetics('veteran')).toEqual(['title_veteran', 'badge_veteran', 'theme_veteran']);
    expect(veteranCosmetics('elite')).toEqual(expect.arrayContaining(veteranCosmetics('veteran')));
    expect(veteranCosmetics('founder')).toEqual(expect.arrayContaining(veteranCosmetics('elite')));
    expect(veteranCosmetics('founder')).toHaveLength(9);
    for (const id of veteranCosmetics('founder')) expect(cosmetics.find((c) => c.id === id)?.exclusive, id).toBe('veteran');
  });
});

describe('veteran set (database)', () => {
  useTestDatabase();

  it('grants the tier with its cosmetics and shows the badge by default', async () => {
    await grantVeteran('vet1', 'elite');
    const p = await getProfile('vet1');
    expect(p.veteran?.tier).toBe('elite');
    expect(p.cosmetics?.owned).toEqual(expect.arrayContaining(veteranCosmetics('elite')));
    expect(p.cosmetics?.owned).not.toContain('title_founder');
    expect(p.cosmetics?.badge).toBe('badge_elite');
    expect(titled('Oct', p)).toBe('🎖️ Oct'); // fallback emoji in tests
  });

  it('the welcome-back message is claimed exactly once, and only by veterans', async () => {
    await grantVeteran('vet2', 'founder');
    await getProfile('newbie');
    const claims = await Promise.all([claimVeteranWelcome('vet2'), claimVeteranWelcome('vet2'), claimVeteranWelcome('vet2')]);
    expect(claims.filter(Boolean)).toEqual(['founder']);
    expect(await claimVeteranWelcome('newbie')).toBeNull();
  });
});

/**
 * Renders sample rank, profile and level-up cards to docs/cards/ for a quick visual check.
 *   npx tsx scripts/cards-preview.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { levelUpCard, profileCard, rankCard, type CardStyle } from '../src/lib/cards';
import { prestigeTag } from '../src/lib/theme';

const out = join(__dirname, '..', 'docs', 'cards');
mkdirSync(out, { recursive: true });
const plain: CardStyle = { background: null, frame: null, accent: '#6066ae', badge: null };
const founder: CardStyle = { background: '#f39c12,#6e1a0a', frame: '#af810e,#f7dc6f', accent: '#af810e', badge: 'badge_founder' };
const elite: CardStyle = { background: '#123c69,#000814', frame: '#8e44ad,#c39bd3', accent: '#8e44ad', badge: 'badge_elite' };
const person = (name: string, title: string | null) => ({ name, title, avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' });

(async () => {
  writeFileSync(join(out, 'rank-plain.png'), await rankCard({ person: person('Newbie', null), style: plain, level: 3, into: 85, needed: 265, rank: 42, accountLevel: 4, prestige: null }));
  writeFileSync(join(out, 'rank-founder.png'), await rankCard({ person: person('Octille', 'Founder'), style: founder, level: 27, into: 3120, needed: 5095, rank: 1, accountLevel: 35, prestige: prestigeTag(3) }));
  writeFileSync(join(out, 'rank-elite-long.png'), await rankCard({ person: person('AVeryLongDisplayNameThatGoesOnForever', 'Master Hacker'), style: elite, level: 112, into: 61000, needed: 68420, rank: 1234, accountLevel: 50, prestige: prestigeTag(10) }));
  writeFileSync(join(out, 'profile-founder.png'), await profileCard({
    person: person('Octille', 'Founder'), style: founder, accountLevel: 35, into: 2400, needed: 5100, prestige: prestigeTag(3), tag: 'Founder · playing since 2021',
    tiles: [['Net worth', '₪ 1,284,550'], ['Achievements', '31 / 49'], ['Fishdex', '24 / 30'], ['Daily streak', '47 days'], ['Shifts worked', '812'], ['Crimes', '214']],
  }));
  writeFileSync(join(out, 'levelup.png'), await levelUpCard({ person: person('Octille', 'Founder'), style: founder, from: 26, to: 27 }));
  console.log('✅ Wrote docs/cards/*.png');
})();

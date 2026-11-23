/**
 * Renders sample rank and profile cards for four kinds of player into docs/card-samples.png.
 *   npx tsx scripts/cards-preview.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { profileCard, rankCard, type CardBadge, type CardStyle } from '../src/lib/cards';
import { prestigeTag } from '../src/lib/theme';

const avatar = (n: number) => `https://cdn.discordapp.com/embed/avatars/${n}.png`;
const brand: CardStyle = { background: null, frame: null, accent: '#6066ae', badge: null };

interface Sample {
  label: string;
  name: string;
  title: string | null;
  style: CardStyle;
  avatar: number;
  server: { level: number; into: number; needed: number; rank: number | null; members: number };
  account: { level: number; into: number; needed: number; ready: boolean };
  prestige: number;
  badges: CardBadge[];
  tiles: [string, string][];
}

const samples: Sample[] = [
  {
    label: 'New player (no cosmetics: brand-blue default)', name: 'Newbie', title: null, style: brand, avatar: 1,
    server: { level: 0, into: 0, needed: 100, rank: null, members: 31 }, account: { level: 2, into: 4, needed: 205, ready: false }, prestige: 0, badges: [],
    tiles: [['Net worth', '₪ 2,340'], ['Server rank', '—'], ['Achievements', '2 / 49'], ['Fishdex', '1 / 30'], ['Daily streak', '1 day'], ['Shifts worked', '3']],
  },
  {
    label: 'Mid-game (Ocean theme, Midnight background)', name: 'Marlin', title: 'Fish Whisperer', style: { background: '#1f2340,#0b0d1a', frame: null, accent: '#1e90ff', badge: null }, avatar: 2,
    server: { level: 12, into: 840, needed: 1420, rank: 3, members: 31 }, account: { level: 14, into: 610, needed: 1197, ready: false }, prestige: 0,
    badges: [{ icon: 'achievements', label: 'Angler' }, { icon: 'achievements', label: 'Regular' }],
    tiles: [['Net worth', '₪ 184,900'], ['Server rank', '#3 of 31'], ['Achievements', '14 / 49'], ['Fishdex', '17 / 30'], ['Daily streak', '12 days'], ['Shifts worked', '96']],
  },
  {
    label: 'Veteran (Elite: Amethyst theme, Elite frame and badge)', name: 'OldTimer', title: 'Elite Veteran', style: { background: null, frame: '#8e44ad,#c39bd3', accent: '#8e44ad', badge: 'badge_elite' }, avatar: 3,
    server: { level: 27, into: 3120, needed: 5095, rank: 1, members: 31 }, account: { level: 22, into: 1800, needed: 2370, ready: false }, prestige: 2,
    badges: [{ icon: 'badge_elite', label: 'Elite Veteran' }, { icon: 'achievements', label: 'Master Hacker' }],
    tiles: [['Net worth', '₪ 1,284,550'], ['Server rank', '#1 of 31'], ['Achievements', '31 / 49'], ['Fishdex', '24 / 30'], ['Daily streak', '47 days'], ['Shifts worked', '812']],
  },
  {
    label: 'Level 35, ready to prestige (Neon theme)', name: 'Grinder', title: 'Workaholic', style: { background: null, frame: null, accent: '#39ff14', badge: null }, avatar: 4,
    server: { level: 18, into: 1, needed: 2620, rank: 7, members: 31 }, account: { level: 35, into: 40, needed: 4022, ready: true }, prestige: 1,
    badges: [{ icon: 'achievements', label: 'Workaholic' }, { icon: 'achievements', label: 'Old Salt' }, { icon: 'achievements', label: 'Peak Performance' }],
    tiles: [['Net worth', '₪ 2,904,100'], ['Server rank', '#7 of 31'], ['Achievements', '27 / 49'], ['Fishdex', '30 / 30'], ['Daily streak', '64 days'], ['Shifts worked', '1,402']],
  },
];

(async () => {
  GlobalFonts.registerFromPath(join(__dirname, '..', 'assets', 'fonts', 'Poppins-SemiBold.ttf'), 'Poppins');
  const rendered: { label: string; rank: Awaited<ReturnType<typeof loadImage>>; profile: Awaited<ReturnType<typeof loadImage>> }[] = [];
  for (const s of samples) {
    const person = { name: s.name, title: s.title, avatarUrl: avatar(s.avatar) };
    const rank = await rankCard({ person, style: s.style, ...s.server, accountLevel: s.account.level, prestige: prestigeTag(s.prestige) });
    const profile = await profileCard({
      person, style: s.style, accountLevel: s.account.level, into: s.account.into, needed: s.account.needed, readyToPrestige: s.account.ready,
      prestige: prestigeTag(s.prestige), badges: s.badges, tiles: s.tiles,
    });
    rendered.push({ label: s.label, rank: await loadImage(rank), profile: await loadImage(profile) });
  }
  const gap = 24;
  const W = 934 * 2 + gap * 3;
  const rowH = (r: (typeof rendered)[number]) => 40 + Math.max(r.rank.height, r.profile.height) + gap;
  const H = rendered.reduce((h, r) => h + rowH(r), gap);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#313338';
  ctx.fillRect(0, 0, W, H);
  let y = gap;
  for (const r of rendered) {
    ctx.fillStyle = '#dbdee1';
    ctx.font = '600 22px Poppins';
    ctx.fillText(r.label, gap, y + 26);
    ctx.drawImage(r.rank, gap, y + 40);
    ctx.drawImage(r.profile, gap * 2 + 934, y + 40);
    y += rowH(r);
  }
  writeFileSync(join(__dirname, '..', 'docs', 'card-samples.png'), canvas.toBuffer('image/png'));
  console.log('✅ Wrote docs/card-samples.png');
})();

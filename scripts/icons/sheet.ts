/**
 * Renders docs/icons-sheet.png: every icon in each colour version, on light and dark Discord,
 * plus white icons on green and blue buttons as they appear in the bot.
 *   npx tsx scripts/icons/sheet.ts   (after scripts/icons/build.ts)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ICON_STROKE, ICON_VARIANTS, iconDefs, type IconKey } from '../../src/content/icons';

const root = join(__dirname, '..', '..');
const dir = join(root, 'assets', 'icons');
const png = (key: IconKey, variant: string) => `data:image/png;base64,${readFileSync(join(dir, `${key}.${variant}.png`)).toString('base64')}`;
const keys = Object.keys(iconDefs) as IconKey[];
const fixed = keys.filter((k) => 'color' in iconDefs[k]);
const plain = keys.filter((k) => !fixed.includes(k));

const BG = { light: { bg: '#ffffff', fg: '#313338' }, dark: { bg: '#313338', fg: '#dbdee1' } };
const BUTTONS = { green: '#248046', blue: '#5865f2' };
const COL = 150;
const COLS = 6;
const ROW = 34;
const W = COLS * COL + 24;
const parts: string[] = [];
let y = 0;

const text = (x: number, ty: number, s: string, fill: string, size = 13, weight = 'normal') =>
  parts.push(`<text x="${x}" y="${ty}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${fill}">${s}</text>`);
const img = (href: string, x: number, iy: number, size = 22) => parts.push(`<image href="${href}" x="${x}" y="${iy}" width="${size}" height="${size}"/>`);

for (const [mode, { bg, fg }] of Object.entries(BG)) {
  const sections: [string, IconKey[], string][] = [
    [`Title icons (brand ${ICON_VARIANTS.brand})`, plain, 'brand'],
    [`Inline icons in embed text (grey ${ICON_VARIANTS.grey})`, plain, 'grey'],
    ['Fixed-colour icons (rarity, badges)', fixed, 'fixed'],
  ];
  const start = y;
  const height = 48 + sections.reduce((h, [, ks]) => h + 30 + Math.ceil(ks.length / COLS) * ROW, 0) + 30 + 3 * 44 + 16;
  parts.push(`<rect x="0" y="${start}" width="${W}" height="${height}" fill="${bg}"/>`);
  y += 30;
  text(12, y, `${mode === 'light' ? 'Light' : 'Dark'} mode (${bg}) · icons at Discord emoji size (22px) · stroke ${ICON_STROKE}`, fg, 16, 'bold');
  y += 18;
  for (const [label, ks, variant] of sections) {
    y += 22;
    text(12, y, label, fg, 13, 'bold');
    y += 8;
    ks.forEach((k, i) => {
      const x = 12 + (i % COLS) * COL;
      const ry = y + Math.floor(i / COLS) * ROW;
      img(png(k, variant), x, ry);
      text(x + 30, ry + 16, k, fg, 13);
    });
    y += Math.ceil(ks.length / COLS) * ROW;
  }
  y += 22;
  text(12, y, `White icons (${ICON_VARIANTS.white}) on green and blue buttons`, fg, 13, 'bold');
  y += 8;
  const samples: [IconKey, string][] = [['work', 'Work'], ['mine', 'Mine'], ['fish', 'Fish'], ['hunt', 'Hunt'], ['dig', 'Dig'], ['daily', 'Daily'], ['crime', 'Crime'], ['search', 'Search'], ['beg', 'Beg'], ['shop', 'Shop'], ['wallet', 'Pay'], ['success', 'Buy']];
  for (const [b, color] of Object.entries(BUTTONS)) {
    let x = 12;
    samples.slice(b === 'green' ? 0 : 6, b === 'green' ? 6 : 12).forEach(([k, label]) => {
      const w = 34 + label.length * 8 + 14;
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="32" rx="4" fill="${color}"/>`);
      img(png(k, 'white'), x + 10, y + 5);
      text(x + 38, y + 21, label, '#ffffff', 14);
      x += w + 8;
    });
    y += 44;
  }
  // Grey button for comparison: no icon
  parts.push(`<rect x="12" y="${y}" width="150" height="32" rx="4" fill="${mode === 'light' ? '#e3e5e8' : '#4e5058'}"/>`);
  text(24, y + 21, 'Fish · 6d 23h', mode === 'light' ? '#313338' : '#ffffff', 14);
  text(176, y + 21, '← grey buttons: no icon', fg, 12);
  y = start + height;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}">${parts.join('')}</svg>`;
writeFileSync(join(root, 'docs', 'icons-sheet.png'), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
console.log('✅ Wrote docs/icons-sheet.png');

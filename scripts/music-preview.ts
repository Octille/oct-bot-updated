/**
 * Renders docs/music-panel.png: the progress bar at 0%, 40% and 100%, and the full now-playing panel,
 * on dark and light Discord, using the real icon PNGs at emoji size (with Discord's ~2.4px emoji spacing).
 *   npx tsx scripts/icons/build.ts && npx tsx scripts/music-preview.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { musicRules } from '../src/content/music';
import { progressBar } from '../src/music/panel';
import type { IconKey } from '../src/content/icons';

const root = join(__dirname, '..');
const dir = join(root, 'assets', 'icons');
const png = (file: string) => `data:image/png;base64,${readFileSync(join(dir, `${file}.png`)).toString('base64')}`;
const fixed = (key: IconKey) => png(`${key}.fixed`);

const THEMES = {
  dark: { bg: '#313338', box: '#2b2d31', border: '#3f4147', text: '#dbdee1', muted: '#949ba4', link: '#00a8fc', code: '#1e1f22', button: '#4e5058' },
  light: { bg: '#ffffff', box: '#f2f3f5', border: '#e3e5e8', text: '#313338', muted: '#5c5e66', link: '#006ce7', code: '#e3e5e8', button: '#e1e2e6' },
};
const EMOJI = 22;
/** Discord's inline emoji margin (0 .05em 0 .1em at 16px). */
const GAP = 2.4;
const BLUE = '#5865f2';
const W = 560;
const parts: string[] = [];
let y = 0;

const text = (x: number, ty: number, s: string, fill: string, size = 14, weight = 'normal', family = 'Arial') =>
  parts.push(`<text x="${x}" y="${ty}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${s}</text>`);
const img = (href: string, x: number, iy: number, size = EMOJI) => parts.push(`<image href="${href}" x="${x}" y="${iy}" width="${size}" height="${size}"/>`);

function drawBar(x: number, by: number, frac: number): void {
  const dur = 274_000;
  progressBar(frac * dur, dur, musicRules.barSegments).forEach((p, i) => img(fixed(p), x + i * (EMOJI + GAP), by));
}

function code(x: number, cy: number, s: string, t: typeof THEMES.dark): number {
  const w = s.length * 8.4 + 10;
  parts.push(`<rect x="${x}" y="${cy - 15}" width="${w}" height="21" rx="4" fill="${t.code}"/>`);
  text(x + 5, cy, s, t.text, 14, 'normal', 'Menlo, monospace');
  return w;
}

function button(x: number, by: number, iconFile: string, bg: string): void {
  parts.push(`<rect x="${x}" y="${by}" width="44" height="32" rx="8" fill="${bg}"/>`);
  img(png(iconFile), x + 12, by + 6, 20);
}

for (const [mode, t] of Object.entries(THEMES)) {
  const start = y;
  const height = 470;
  parts.push(`<rect x="0" y="${start}" width="${W}" height="${height}" fill="${t.bg}"/>`);
  y += 30;
  text(16, y, `${mode === 'dark' ? 'Dark' : 'Light'} mode · ${musicRules.barSegments} pieces at emoji size (${EMOJI}px)`, t.text, 15, 'bold');

  // Bars
  for (const [label, frac] of [['0%', 0], ['40%', 0.4], ['100%', 1]] as const) {
    y += 34;
    text(16, y + 16, label, t.muted, 13);
    drawBar(64, y, frac);
  }

  // Full panel
  y += 50;
  const bx = 16;
  const bw = W - 32;
  const bh = 250;
  parts.push(`<rect x="${bx}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${t.box}" stroke="${t.border}"/>`);
  parts.push(`<rect x="${bx}" y="${y}" width="4" height="${bh}" fill="#6066ae"/>`);
  const cx = bx + 18;
  img(png('music.brand'), cx, y + 14, 16);
  text(cx + 20, y + 27, 'Now playing', t.muted, 12);
  text(cx, y + 56, 'Midnight City', t.link, 20, 'bold');
  text(cx, y + 80, 'M83', t.text, 14);
  // Album art placeholder
  parts.push(`<defs><linearGradient id="art${mode}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6066ae"/><stop offset="1" stop-color="#e05a8f"/></linearGradient></defs>`);
  parts.push(`<rect x="${bx + bw - 102}" y="${y + 14}" width="86" height="86" rx="8" fill="url(#art${mode})"/>`);
  text(cx, y + 116, 'Added by <tspan fill="' + (mode === 'dark' ? '#c9cdfb' : '#505cdc') + '">@Octille</tspan> in <tspan fill="' + (mode === 'dark' ? '#c9cdfb' : '#505cdc') + '">#Music</tspan> · 2 up next · volume 80%', t.muted, 12);
  code(cx, y + 150, '1:49 / 4:34', t);
  drawBar(cx, y + 160, 0.4);
  const by = y + 200;
  button(cx, by, 'mp_back.grey', t.button);
  button(cx + 52, by, 'mp_pause.white', BLUE);
  button(cx + 104, by, 'mp_next.grey', t.button);
  button(cx + 156, by, 'mp_loop1.white', BLUE);
  button(cx + 208, by, 'mp_controls.grey', t.button);
  text(cx + 264, by + 21, '← loop on (track)', t.muted, 12);
  y = start + height;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}">${parts.join('')}</svg>`;
const fontDir = join(root, 'assets', 'fonts');
writeFileSync(join(root, 'docs', 'music-panel.png'), new Resvg(svg, { font: { loadSystemFonts: true, fontFiles: [join(fontDir, 'NotoSans-Bold.ttf')] } }).render().asPng());
console.log('✅ Wrote docs/music-panel.png');

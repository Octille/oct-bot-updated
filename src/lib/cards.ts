import { join } from 'node:path';
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { logError } from './logger';

/**
 * Rank, profile and level-up cards. Rendering is async (avatars are downloaded), so cards are
 * attached by commands and announcements, never built inside the pure menu screens.
 */

const ASSETS = join(__dirname, '..', '..', 'assets');
/** Poppins, with Noto Sans for glyphs Poppins lacks (₪). Both are OFL, in assets/fonts. */
const FONT = 'Poppins, "Noto Sans"';
let fontsLoaded = false;

function ensureFonts(): void {
  if (fontsLoaded) return;
  for (const weight of ['Regular', 'SemiBold', 'Bold']) GlobalFonts.registerFromPath(join(ASSETS, 'fonts', `Poppins-${weight}.ttf`), 'Poppins');
  GlobalFonts.registerFromPath(join(ASSETS, 'fonts', 'NotoSans-Bold.ttf'), 'Noto Sans');
  fontsLoaded = true;
}

export interface CardStyle {
  /** "#top,#bottom" background gradient (a background cosmetic), or null for the default. */
  background: string | null;
  /** "#a,#b" avatar ring (a frame cosmetic), or null for a plain ring in the accent colour. */
  frame: string | null;
  /** Bar and highlight colour (the equipped theme, or the brand colour). */
  accent: string;
  /** Icon key of the equipped badge, drawn before the name. */
  badge: string | null;
}

export interface Person {
  name: string;
  title: string | null;
  avatarUrl: string | null;
}

const DEFAULT_BG = '#2b2f5c,#12142a';
const WHITE = '#ffffff';
const MUTED = '#b5bac1';

/* ── Cache: identical cards within a minute are served from memory ───────────────────────── */

const cache = new Map<string, { at: number; png: Buffer }>();
const CACHE_MS = 60_000;

async function cached(key: string, draw: () => Promise<Buffer>): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.png;
  const png = await draw();
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), png });
  return png;
}

/* ── Drawing helpers ────────────────────────────────────────────────────────────────────── */

async function fetchImage(url: string | null): Promise<Image | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    logError('cards avatar', err);
    return null;
  }
}

async function iconImage(key: string | null): Promise<Image | null> {
  if (!key) return null;
  try {
    return await loadImage(join(ASSETS, 'icons', `${key}.fixed.png`));
  } catch {
    return null;
  }
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function gradient(ctx: SKRSContext2D, spec: string, x0: number, y0: number, x1: number, y1: number): string {
  const [a, b] = spec.split(',');
  if (!b) return a!;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a!);
  g.addColorStop(1, b);
  return g as unknown as string;
}

function background(ctx: SKRSContext2D, w: number, h: number, spec: string | null): void {
  roundRect(ctx, 0, 0, w, h, 24);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = gradient(ctx, spec ?? DEFAULT_BG, 0, 0, w * 0.4, h);
  ctx.fillRect(0, 0, w, h);
  // A soft darker panel keeps text readable on bright backgrounds
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  roundRect(ctx, 16, 16, w - 32, h - 32, 18);
  ctx.fill();
  ctx.restore();
}

function avatar(ctx: SKRSContext2D, img: Image | null, name: string, cx: number, cy: number, r: number, style: CardStyle): void {
  // Ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fillStyle = gradient(ctx, style.frame ?? style.accent, cx - r, cy - r, cx + r, cy + r);
  ctx.fill();
  if (style.frame) {
    // Frames get a thin outer glow line so they read as a special ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = '#4e5058';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = WHITE;
    ctx.font = `bold ${Math.round(r)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name[0] ?? '?').toUpperCase(), cx, cy + 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** Draws text, shrinking it to fit `maxWidth` (down to 60%) and then cutting it with "…". */
function fitText(ctx: SKRSContext2D, text: string, x: number, y: number, maxWidth: number, size: number, weight = 'bold', color = WHITE): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && s > size * 0.6) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  let t = text;
  while (ctx.measureText(t).width > maxWidth && t.length > 1) t = t.slice(0, -2) + '…';
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  return ctx.measureText(t).width;
}

function bar(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, ratio: number, accent: string): void {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  const fill = Math.max(h, Math.round(w * Math.min(1, Math.max(0, ratio))));
  roundRect(ctx, x, y, fill, h, h / 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

function label(ctx: SKRSContext2D, text: string, value: string, rightX: number, y: number, accent: string): number {
  ctx.textAlign = 'right';
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(value, rightX, y);
  const vw = ctx.measureText(value).width;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(text, rightX - vw - 10, y);
  const lw = ctx.measureText(text).width;
  ctx.textAlign = 'left';
  return rightX - vw - 10 - lw - 28;
}

async function nameLine(ctx: SKRSContext2D, person: Person, style: CardStyle, x: number, y: number, maxWidth: number, size = 36): Promise<void> {
  const badge = await iconImage(style.badge);
  let nx = x;
  if (badge) {
    ctx.drawImage(badge, x, y - size + 2, size, size);
    nx += size + 10;
  }
  fitText(ctx, person.name, nx, y, maxWidth - (nx - x), size);
}

const fmt = (n: number) => n.toLocaleString('en-US');

/* ── Rank card ──────────────────────────────────────────────────────────────────────────── */

export interface RankCardData {
  person: Person;
  style: CardStyle;
  level: number;
  into: number;
  needed: number;
  rank: number | null;
  accountLevel: number;
  prestige: { value: number; label: string; color: string } | null;
}

export async function rankCard(d: RankCardData): Promise<Buffer> {
  return cached(`rank:${JSON.stringify(d)}`, async () => {
    ensureFonts();
    const W = 934;
    const H = 282;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    background(ctx, W, H, d.style.background);
    avatar(ctx, await fetchImage(d.person.avatarUrl), d.person.name, 141, 141, 92, d.style);

    const left = 270;
    // Level and rank, top right
    let edge = label(ctx, 'LEVEL', String(d.level), W - 48, 82, d.style.accent);
    if (d.rank) edge = label(ctx, 'RANK', `#${d.rank}`, edge, 82, WHITE);

    await nameLine(ctx, d.person, d.style, left, 150, W - 48 - left);
    if (d.person.title) fitText(ctx, d.person.title, left, 182, 380, 20, '600', MUTED);

    ctx.textAlign = 'right';
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`${fmt(d.into)} / ${fmt(d.needed)} XP`, W - 48, 182);
    ctx.textAlign = 'left';

    bar(ctx, left, 198, W - 48 - left, 30, d.needed ? d.into / d.needed : 0, d.style.accent);

    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = MUTED;
    const foot = `Account Lv ${d.accountLevel}`;
    ctx.fillText(foot, left, 256);
    if (d.prestige) {
      const fw = ctx.measureText(foot + '   ').width;
      ctx.fillStyle = d.prestige.color;
      ctx.fillText(`Prestige ${d.prestige.label}`, left + fw, 256);
    }
    return canvas.toBuffer('image/png');
  });
}

/* ── Profile card ───────────────────────────────────────────────────────────────────────── */

export interface ProfileCardData {
  person: Person;
  style: CardStyle;
  accountLevel: number;
  into: number;
  needed: number;
  prestige: { value: number; label: string; color: string } | null;
  /** Up to 6 stat tiles: label → value */
  tiles: [string, string][];
  /** A short line under the title, e.g. "Founder · joined 2021". */
  tag: string | null;
}

export async function profileCard(d: ProfileCardData): Promise<Buffer> {
  return cached(`profile:${JSON.stringify(d)}`, async () => {
    ensureFonts();
    const W = 934;
    const H = 460;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    background(ctx, W, H, d.style.background);
    avatar(ctx, await fetchImage(d.person.avatarUrl), d.person.name, 124, 124, 76, d.style);

    const left = 230;
    await nameLine(ctx, d.person, d.style, left, 104, W - 48 - left, 38);
    const sub = [d.person.title, d.tag].filter(Boolean).join('  ·  ');
    if (sub) fitText(ctx, sub, left, 138, W - 48 - left, 20, '600', MUTED);

    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = WHITE;
    ctx.fillText(`Account Lv ${d.accountLevel}`, left, 182);
    if (d.prestige) {
      const w = ctx.measureText(`Account Lv ${d.accountLevel}   `).width;
      ctx.fillStyle = d.prestige.color;
      ctx.fillText(`Prestige ${d.prestige.label}`, left + w, 182);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.fillText(`${fmt(d.into)} / ${fmt(d.needed)} XP`, W - 48, 182);
    ctx.textAlign = 'left';
    bar(ctx, left, 194, W - 48 - left, 22, d.needed ? d.into / d.needed : 0, d.style.accent);

    // Stat tiles, 3 per row
    const cols = 3;
    const gap = 16;
    const tx = 40;
    const tw = (W - 80 - gap * (cols - 1)) / cols;
    const th = 92;
    d.tiles.slice(0, 6).forEach(([name, value], i) => {
      const x = tx + (i % cols) * (tw + gap);
      const y = 250 + Math.floor(i / cols) * (th + gap) - 8;
      roundRect(ctx, x, y, tw, th, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      fitText(ctx, name.toUpperCase(), x + 18, y + 32, tw - 36, 15, '600', MUTED);
      fitText(ctx, value, x + 18, y + 72, tw - 36, 30, 'bold', WHITE);
    });
    return canvas.toBuffer('image/png');
  });
}

/* ── Level-up card ──────────────────────────────────────────────────────────────────────── */

export async function levelUpCard(d: { person: Person; style: CardStyle; from: number; to: number }): Promise<Buffer> {
  return cached(`lvl:${JSON.stringify(d)}`, async () => {
    ensureFonts();
    const W = 640;
    const H = 180;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    background(ctx, W, H, d.style.background);
    avatar(ctx, await fetchImage(d.person.avatarUrl), d.person.name, 98, 90, 52, d.style);
    const left = 180;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = d.style.accent;
    ctx.fillText('LEVEL UP', left, 62);
    await nameLine(ctx, d.person, d.style, left, 102, W - 40 - left, 28);
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = MUTED;
    const from = `Lv ${d.from}  »  `;
    ctx.fillText(from, left, 146);
    ctx.fillStyle = WHITE;
    ctx.fillText(`Lv ${d.to}`, left + ctx.measureText(from).width, 146);
    return canvas.toBuffer('image/png');
  });
}

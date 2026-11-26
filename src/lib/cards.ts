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

/** Default card background: a subtle brand-blue gradient (with a dot pattern) when none is equipped. */
const DEFAULT_BG = '#3d4285,#151833';
const WHITE = '#ffffff';
const MUTED = '#b5bac1';
/** The dark panel text sits on; accents are lightened until they read well against it. */
const PANEL = '#1b1d35';

/* ── Colour helpers ─────────────────────────────────────────────────────────────────────── */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Mixes the colour with white until it has at least `min` contrast on the card panel. */
export function readableAccent(hex: string, min = 4.5): string {
  const [r, g, b] = rgb(hex);
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mix = [r, g, b].map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
    if (contrast(`#${mix}`, PANEL) >= min) return `#${mix}`;
  }
  return WHITE;
}

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

/** A fixed-colour icon (badges), or the white version of a regular icon. */
async function iconImage(key: string | null): Promise<Image | null> {
  if (!key) return null;
  for (const variant of ['fixed', 'white']) {
    try {
      return await loadImage(join(ASSETS, 'icons', `${key}.${variant}.png`));
    } catch {
      // try the next variant
    }
  }
  return null;
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
  if (!spec) {
    // A faint dot grid so the default doesn't look flat
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let y = 12; y < h; y += 22) for (let x = 12 + ((y / 22) % 2) * 11; x < w; x += 22) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A soft darker panel keeps text readable on bright backgrounds
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
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
  const r = Math.min(1, Math.max(0, ratio));
  if (r <= 0) return; // 0%: just the empty track
  const fill = Math.max(8, Math.round(w * r)); // 1–3% still shows a sliver
  roundRect(ctx, x, y, fill, h, Math.min(h / 2, fill / 2));
  ctx.fillStyle = accent;
  ctx.fill();
}

/** A stat in the top-right: small caps label above a big value, right-aligned. Returns its left edge. */
function stat(ctx: SKRSContext2D, label: string, value: string, sub: string | null, rightX: number, y: number, color: string, size = 48): number {
  ctx.textAlign = 'right';
  ctx.font = `600 15px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(label, rightX, y - 46); // same label height whatever the value size
  const lw = ctx.measureText(label).width;
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(value, rightX, y + 4);
  let width = Math.max(lw, ctx.measureText(value).width);
  if (sub) {
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(sub, rightX, y + 26);
    width = Math.max(width, ctx.measureText(sub).width);
  }
  ctx.textAlign = 'left';
  return rightX - width;
}

/** A five-point star, for prestige. */
function star(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export interface CardBadge {
  /** Fixed-colour icon key (e.g. badge_founder), or null for a text-only pill. */
  icon: string | null;
  label: string;
}

/** Pills ending at `rightX`, in reading order (the first badge is leftmost). */
async function badgeRow(ctx: SKRSContext2D, badges: CardBadge[], rightX: number, y: number): Promise<void> {
  let x = rightX;
  ctx.font = `600 15px ${FONT}`;
  for (const b of [...badges].reverse()) {
    const img = await iconImage(b.icon);
    const tw = ctx.measureText(b.label).width;
    const w = tw + 24 + (img ? 24 : 0);
    x -= w;
    roundRect(ctx, x, y, w, 30, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    if (img) ctx.drawImage(img, x + 10, y + 5, 20, 20);
    ctx.fillStyle = WHITE;
    ctx.fillText(b.label, x + 12 + (img ? 22 : 0), y + 21);
    x -= 8;
  }
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
  /** Server level */
  level: number;
  into: number;
  needed: number;
  rank: number | null;
  /** Members with XP in this server */
  members: number;
  accountLevel: number;
  prestige: { value: number; label: string; color: string } | null;
}

export async function rankCard(d: RankCardData): Promise<Buffer> {
  return cached(`rank:${JSON.stringify(d)}`, async () => {
    ensureFonts();
    const W = 934;
    const H = 282;
    const P = 40;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const accent = readableAccent(d.style.accent);
    const style = { ...d.style, accent };
    background(ctx, W, H, d.style.background);
    avatar(ctx, await fetchImage(d.person.avatarUrl), d.person.name, P + 100, H / 2, 92, style);

    const left = 270;
    // Top right: server level (big, accent) and server rank
    let edge = stat(ctx, 'SERVER LEVEL', String(d.level), null, W - P - 8, 96, accent, 52);
    if (d.rank) edge = stat(ctx, 'SERVER RANK', `#${fmt(d.rank)}`, `of ${fmt(d.members)}`, edge - 36, 96, WHITE, 40);

    await nameLine(ctx, d.person, style, left, 150, edge - 24 - left);
    if (d.person.title) fitText(ctx, d.person.title, left, 182, 380, 20, '600', MUTED);

    ctx.textAlign = 'right';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`${fmt(d.into)} / ${fmt(d.needed)} XP`, W - P - 8, 184);
    ctx.textAlign = 'left';
    bar(ctx, left, 198, W - P - 8 - left, 28, d.needed ? d.into / d.needed : 0, accent);

    // Bottom corner: the global account level, clearly labelled
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = MUTED;
    const foot = `Account level ${d.accountLevel}`;
    ctx.fillText(foot, left, 252);
    if (d.prestige) {
      ctx.fillStyle = d.prestige.color;
      ctx.fillText(`Prestige ${d.prestige.label}`, left + ctx.measureText(`${foot}   `).width, 252);
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
  /** Level 35+ with prestige available: the bar shows "Ready to prestige". */
  readyToPrestige: boolean;
  prestige: { value: number; label: string; color: string } | null;
  /** Pills in the top-right: veteran tier, top achievements. */
  badges: CardBadge[];
  /** Up to 6 stat tiles: label → value */
  tiles: [string, string][];
}

export async function profileCard(d: ProfileCardData): Promise<Buffer> {
  return cached(`profile:${JSON.stringify(d)}`, async () => {
    ensureFonts();
    const W = 934;
    const P = 40; // equal padding on every side
    const tileH = 92;
    const gap = 16;
    const tilesTop = 250;
    const rows = Math.ceil(Math.min(6, d.tiles.length) / 3);
    const H = tilesTop + rows * tileH + (rows - 1) * gap + P;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const accent = readableAccent(d.style.accent);
    const style = { ...d.style, accent };
    background(ctx, W, H, d.style.background);
    avatar(ctx, await fetchImage(d.person.avatarUrl), d.person.name, P + 80, P + 84, 76, style);

    const left = 230;
    // Top right: prestige (stars + numeral) and the badge row
    let nameRight = W - P - 8;
    if (d.prestige) {
      const n = Math.min(10, d.prestige.value);
      const size = 9;
      for (let i = 0; i < n; i++) star(ctx, W - P - 8 - size - i * (size * 2 + 3), P + 22, size, d.prestige.color);
      ctx.textAlign = 'right';
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillStyle = d.prestige.color;
      ctx.fillText(`Prestige ${d.prestige.label}`, W - P - 8, P + 60);
      ctx.textAlign = 'left';
      nameRight = W - P - 8 - Math.max(n * (size * 2 + 3), ctx.measureText(`Prestige ${d.prestige.label}`).width) - 24;
    }
    if (d.badges.length) await badgeRow(ctx, d.badges.slice(0, 3), W - P - 8, P + 74);

    await nameLine(ctx, d.person, style, left, P + 64, Math.min(nameRight, W - P - 8) - left, 38);
    if (d.person.title) fitText(ctx, d.person.title, left, P + 98, 320, 20, '600', MUTED);

    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = WHITE;
    ctx.fillText(`Account level ${d.accountLevel}`, left, 182);
    ctx.textAlign = 'right';
    ctx.fillStyle = d.readyToPrestige ? accent : MUTED;
    ctx.fillText(d.readyToPrestige ? 'Ready to prestige' : `${fmt(d.into)} / ${fmt(d.needed)} XP`, W - P - 8, 182);
    ctx.textAlign = 'left';
    bar(ctx, left, 194, W - P - 8 - left, 22, d.readyToPrestige ? 1 : d.needed ? d.into / d.needed : 0, accent);

    // Stat tiles, 3 per row, inside the padding
    const cols = 3;
    const tw = (W - 2 * P - gap * (cols - 1)) / cols;
    d.tiles.slice(0, 6).forEach(([name, value], i) => {
      const x = P + (i % cols) * (tw + gap);
      const y = tilesTop + Math.floor(i / cols) * (tileH + gap);
      roundRect(ctx, x, y, tw, tileH, 14);
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
    avatar(ctx, await fetchImage(d.person.avatarUrl), d.person.name, 98, 90, 52, { ...d.style, accent: readableAccent(d.style.accent) });
    const left = 180;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = readableAccent(d.style.accent);
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

/**
 * Renders the icon set in src/content/icons.ts to 64×64 transparent PNGs in assets/icons/:
 * `<key>.<variant>.png` for brand/white/grey, `<key>.fixed.png` for fixed-colour icons.
 *   npx tsx scripts/icons/build.ts
 * Writes assets/icons/manifest.json (`<key>.<variant>` → content hash) for the sync script.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ICON_STROKE, iconDefs, iconImages } from '../../src/content/icons';

const SIZE = 64;
const root = join(__dirname, '..', '..');
const tablerDir = join(root, 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const outDir = join(root, 'assets', 'icons');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.png')) rmSync(join(outDir, f));

function render(tabler: string, color: string): Buffer {
  const svg = readFileSync(join(tablerDir, `${tabler}.svg`), 'utf8')
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/stroke-width="[\d.]+"/g, `stroke-width="${ICON_STROKE}"`);
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: SIZE }, background: 'rgba(0,0,0,0)' }).render().asPng());
}

const manifest: Record<string, string> = {};
for (const { key, variant, color } of iconImages()) {
  const png = render(iconDefs[key].tabler, color);
  writeFileSync(join(outDir, `${key}.${variant}.png`), png);
  manifest[`${key}.${variant}`] = createHash('sha256').update(png).digest('hex').slice(0, 6);
}
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✅ Rendered ${Object.keys(manifest).length} images for ${Object.keys(iconDefs).length} icons to assets/icons/ (${SIZE}×${SIZE}, stroke ${ICON_STROKE})`);

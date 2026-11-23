/**
 * Renders the icon set in src/content/icons.ts to 64×64 transparent PNGs in assets/icons/.
 *   npx tsx scripts/icons/build.ts
 * Writes assets/icons/manifest.json (key → content hash) for the sync script.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { ICON_COLOR, ICON_STROKE, iconDefs, type IconDef } from '../../src/content/icons';

const SIZE = 64;
const root = join(__dirname, '..', '..');
const tablerDir = join(root, 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const outDir = join(root, 'assets', 'icons');
mkdirSync(outDir, { recursive: true });

function render(def: IconDef): Buffer {
  const svg = readFileSync(join(tablerDir, `${def.tabler}.svg`), 'utf8')
    .replace(/stroke="currentColor"/g, `stroke="${def.color ?? ICON_COLOR}"`)
    .replace(/stroke-width="[\d.]+"/g, `stroke-width="${ICON_STROKE}"`);
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: SIZE }, background: 'rgba(0,0,0,0)' }).render().asPng());
}

const manifest: Record<string, string> = {};
for (const [key, def] of Object.entries(iconDefs) as [string, IconDef][]) {
  const png = render(def);
  writeFileSync(join(outDir, `${key}.png`), png);
  manifest[key] = createHash('sha256').update(png).digest('hex').slice(0, 6);
}
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✅ Rendered ${Object.keys(manifest).length} icons to assets/icons/ (${SIZE}×${SIZE}, stroke ${ICON_STROKE}, ${ICON_COLOR})`);

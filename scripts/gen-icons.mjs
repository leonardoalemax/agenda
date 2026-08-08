// Gera os PNGs do PWA a partir de public/favicon.svg
// Uso: npm run icons
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'public', 'favicon.svg'));
const outDir = join(root, 'public', 'icons');
await mkdir(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

for (const t of targets) {
  await sharp(svg).resize(t.size, t.size).png().toFile(join(outDir, t.name));
  console.log('✓', t.name);
}

// apple-touch-icon (iOS tela de início): 180px, fundo sólido (sem alfa)
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: '#0066cc' })
  .png()
  .toFile(join(outDir, 'apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png');

// Versão "maskable": ícone com margem de segurança sobre fundo sólido
const inner = 512 - 128; // padding de 64px de cada lado
const glyph = await sharp(svg).resize(inner, inner).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#6d5efc' },
})
  .composite([{ input: glyph, gravity: 'center' }])
  .png()
  .toFile(join(outDir, 'maskable-512.png'));
console.log('✓ maskable-512.png');

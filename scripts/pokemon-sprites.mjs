// Baixa os sprites dos Pokémon para public/hobbies/pokemon/sprites/<id>.png
// Uso: npm run pokemon:sprites
//
// Precisam ser locais: o PWA tem que funcionar offline (diretriz 2 do CLAUDE.md).
// São ~1025 arquivos de ~1KB — no total ~1,5MB.
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readMd } from './lib/content-md.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'hobbies', 'pokemon', 'sprites');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const CONCURRENCY = 12;

const { frontmatter } = await readMd(join(root, 'src/content/hobbies/pokemon/pokemon.md'));

await mkdir(outDir, { recursive: true });
const existing = new Set(await readdir(outDir).catch(() => []));

const ids = frontmatter.species.map((e) => e.number);
const todo = ids.filter((id) => !existing.has(`${id}.png`));

console.log(`${ids.length} sprites no total · ${todo.length} a baixar · ${ids.length - todo.length} já em disco`);

let ok = 0;
let fail = [];

async function worker(queue) {
  while (queue.length) {
    const id = queue.shift();
    try {
      const res = await fetch(`${BASE}/${id}.png`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(join(outDir, `${id}.png`), Buffer.from(await res.arrayBuffer()));
      ok++;
      if (ok % 100 === 0) console.log(`  ${ok}/${todo.length}…`);
    } catch (err) {
      fail.push(`${id}: ${err.message}`);
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`✓ ${ok} baixados`);
if (fail.length) {
  console.log(`✗ ${fail.length} falharam:`);
  fail.slice(0, 10).forEach((f) => console.log('   ', f));
  process.exitCode = 1;
}

// Baixa os ícones de marcos (insígnias etc.) para
// public/hobbies/pokemon/badges/<arquivo>.png e reescreve marcos.json pra
// apontar pro caminho local em vez da URL do GitHub.
// Uso: npm run pokemon:marcos
//
// Precisam ser locais: o PWA tem que funcionar offline (diretriz 2 do CLAUDE.md).
// São ~51 arquivos (badges + poke-ball), poucos KB no total.
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'hobbies', 'pokemon', 'badges');
const marcosPath = join(root, 'src/content/hobbies/pokemon/data/marcos.json');
const LOCAL_PREFIX = 'hobbies/pokemon/badges/';

function basenameFromUrl(url) {
  return decodeURIComponent(url.split('/').pop());
}

const marcos = JSON.parse(await readFile(marcosPath, 'utf-8'));

const urls = new Set();
for (const entry of Object.values(marcos)) {
  for (const insignia of entry.insignias) {
    if (!insignia.url.startsWith('http')) continue; // já local, de uma execução anterior
    urls.add(insignia.url);
  }
}

await mkdir(outDir, { recursive: true });
const existing = new Set(await readdir(outDir).catch(() => []));
const todo = [...urls].filter((url) => !existing.has(basenameFromUrl(url)));

console.log(`${urls.size} ícones no total · ${todo.length} a baixar · ${urls.size - todo.length} já em disco`);

let ok = 0;
const fail = [];

async function worker(queue) {
  while (queue.length) {
    const url = queue.shift();
    const file = basenameFromUrl(url);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(join(outDir, file), Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (err) {
      fail.push(`${file}: ${err.message}`);
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: 8 }, () => worker(queue)));

console.log(`✓ ${ok} baixados`);
if (fail.length) {
  console.log(`✗ ${fail.length} falharam:`);
  fail.forEach((f) => console.log('   ', f));
  process.exitCode = 1;
}

// Reescreve marcos.json com o caminho local — só troca se o arquivo existe
// em disco (não aponta pra um download que falhou).
const downloaded = new Set(await readdir(outDir).catch(() => []));
let rewritten = 0;
for (const entry of Object.values(marcos)) {
  for (const insignia of entry.insignias) {
    if (!insignia.url.startsWith('http')) continue;
    const file = basenameFromUrl(insignia.url);
    if (!downloaded.has(file)) continue;
    insignia.url = `${LOCAL_PREFIX}${file}`;
    rewritten++;
  }
}

await writeFile(marcosPath, `${JSON.stringify(marcos, null, '\t')}\n`);
console.log(`✓ marcos.json atualizado (${rewritten} referências trocadas pro caminho local)`);

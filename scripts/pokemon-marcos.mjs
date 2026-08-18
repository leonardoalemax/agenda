// Baixa os ícones de marcos (insígnias etc.) para
// public/hobbies/pokemon/badges/<arquivo>.png e edita cada
// pokemon-game.md pra apontar pro caminho local em vez da URL remota.
// Uso: npm run pokemon:marcos
//
// Precisam ser locais: o PWA tem que funcionar offline (diretriz 2 do CLAUDE.md).
// São ~51 arquivos (badges + poke-ball), poucos KB no total.
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readMd, updateMdFrontmatter } from './lib/content-md.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'hobbies', 'pokemon', 'badges');
const gamesDir = join(root, 'src/content/hobbies/pokemon/games');
const LOCAL_PREFIX = 'hobbies/pokemon/badges/';

function basenameFromUrl(url) {
  return decodeURIComponent(url.split('/').pop());
}

const gameFiles = (await readdir(gamesDir)).filter((f) => f.endsWith('.md'));
const gamePaths = gameFiles.map((f) => join(gamesDir, f));
const games = await Promise.all(gamePaths.map((p) => readMd(p).then(({ frontmatter }) => frontmatter)));

const urls = new Set();
for (const game of games) {
  for (const marco of game.marcos) {
    if (marco.icon.startsWith('http')) urls.add(marco.icon);
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

// Edita cada jogo com o caminho local — só troca se o arquivo existe em
// disco (não aponta pra um download que falhou).
const downloaded = new Set(await readdir(outDir).catch(() => []));
let rewritten = 0;
for (const path of gamePaths) {
  await updateMdFrontmatter(path, (fm) => {
    let changed = false;
    for (const marco of fm.marcos) {
      if (!marco.icon.startsWith('http')) continue;
      const file = basenameFromUrl(marco.icon);
      if (!downloaded.has(file)) continue;
      marco.icon = `${LOCAL_PREFIX}${file}`;
      changed = true;
      rewritten++;
    }
    return changed ? fm : undefined;
  });
}

console.log(`✓ ${rewritten} referências trocadas pro caminho local em src/content/hobbies/pokemon/games/`);

// Relaciona cada jogo de Pokémon ao jogo correspondente no RetroAchievements.
// Uso: npm run pokemon:ra-map
//
// Roda de novo sempre que quiser atualizar — a relação é estável (jogo retrô
// não muda de id), mas rodar de novo não faz mal. Mesma regra do cheevos:sync:
// chave no `.env`, nada em runtime.
//
// Por que script em vez de tabela escrita à mão: os ids do RetroAchievements
// não são adivinháveis, e uma tabela chumbada envelhece calada. Aqui a lista de
// consoles vem de cada src/content/hobbies/pokemon/games/<slug>.md (campo
// `platforms`) e os ids vêm da API — o que sobra pra curadoria é só o título
// esperado de cada jogo.
//
// Saída: edita o campo `retroachievements` direto em cada
// src/content/hobbies/pokemon/games/<slug>.md — não escreve JSON nenhum.
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readMd, updateMdFrontmatter } from './lib/content-md.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = join(root, 'src', 'content', 'hobbies', 'pokemon', 'games');

const API = 'https://retroachievements.org/API';

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  /* pode vir do ambiente */
}

// Só a chave: este script lê o catálogo público de jogos, não o progresso de
// ninguém — por isso não precisa de RA_USERNAME como o cheevos:sync.
const KEY = process.env.RA_API_KEY;

if (!KEY) {
  console.error(`
Falta a chave do RetroAchievements.
Preencha RA_API_KEY no .env (modelo em .env.example).
`);
  process.exit(1);
}

// ===== títulos esperados por slug =====
//
// Só o título — o console sai do campo `platforms` de cada game.md e o id da API.
// Casamento é por título normalizado e exato, de propósito: o RetroAchievements
// tem centenas de romhacks ("Pokemon Red Kaizo") e subsets ("… [Subset - Bonus]")
// que um "contém" pegaria por engano.
const TITLES = {
  red: ['Pokemon Red Version'],
  blue: ['Pokemon Blue Version'],
  yellow: ['Pokemon Yellow Version: Special Pikachu Edition', 'Pokemon Yellow Version'],
  'red-japan': ['Pocket Monsters: Aka', 'Pocket Monsters Aka'],
  'green-japan': ['Pocket Monsters: Midori', 'Pocket Monsters Midori'],
  'blue-japan': ['Pocket Monsters: Ao', 'Pocket Monsters Ao'],

  gold: ['Pokemon Gold Version'],
  silver: ['Pokemon Silver Version'],
  crystal: ['Pokemon Crystal Version'],

  ruby: ['Pokemon Ruby Version'],
  sapphire: ['Pokemon Sapphire Version'],
  emerald: ['Pokemon Emerald Version'],
  firered: ['Pokemon FireRed Version'],
  leafgreen: ['Pokemon LeafGreen Version'],

  colosseum: ['Pokemon Colosseum'],
  xd: ['Pokemon XD: Gale of Darkness', 'Pokemon XD - Gale of Darkness'],

  diamond: ['Pokemon Diamond Version'],
  pearl: ['Pokemon Pearl Version'],
  platinum: ['Pokemon Platinum Version'],
  // O RetroAchievements junta HG/SS numa entrada só (o `|` é a convenção deles
  // pra jogo de versão dupla). Os dois slugs apontam pro mesmo id — e é isso
  // mesmo, o conjunto de conquistas é compartilhado.
  heartgold: ['Pokemon HeartGold Version | Pokemon SoulSilver Version'],
  soulsilver: ['Pokemon HeartGold Version | Pokemon SoulSilver Version'],
  black: ['Pokemon Black Version'],
  white: ['Pokemon White Version'],
  'black-2': ['Pokemon Black Version 2'],
  'white-2': ['Pokemon White Version 2'],
};

// Jogos cujo console o RetroAchievements suporta, mas que mesmo assim não têm
// equivalente útil. Registrado explicitamente pra não virar "falha" a cada
// execução — a ausência aqui é resultado, não erro.
const NO_EQUIVALENT = {
  'red-japan': 'Pocket Monsters Aka não tem entrada no RetroAchievements',
  'green-japan':
    'Pocket Monsters Midori existe (~Z~) mas sem conquistas próprias — só um subset tem',
  'blue-japan':
    'Pocket Monsters Ao existe mas sem conquistas próprias — só subsets têm',
};

// Plataformas do projeto que não são um sistema do RetroAchievements.
// Virtual Console é loja, não console — o jogo lá é a ROM de Game Boy mesmo.
const NOT_A_SYSTEM = new Set(['Virtual Console (3DS)']);

/** Tira acento, pontuação e caixa: "Pokémon XD: Gale" -> "pokemon xd gale". */
function norm(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function api(endpoint, params) {
  const qs = new URLSearchParams({ ...params, y: KEY });
  const res = await fetch(`${API}/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  return res.json();
}

// ===== 1. consoles do projeto =====

const gameFiles = (await readdir(GAMES_DIR)).filter((f) => f.endsWith('.md'));
// slug -> caminho do .md, pra reaproveitar na hora de gravar o resultado.
const gamePathBySlug = new Map(gameFiles.map((f) => [f.replace(/\.md$/, ''), join(GAMES_DIR, f)]));

/** slug -> Set de nomes de console (como o projeto chama). */
const consolesOf = new Map();
for (const [slug, path] of gamePathBySlug) {
  const { frontmatter } = await readMd(path);
  const set = new Set();
  for (const p of frontmatter.platforms ?? []) {
    if (!NOT_A_SYSTEM.has(p.platform)) set.add(p.platform);
  }
  consolesOf.set(slug, set);
}

// ===== 2. sistemas do RetroAchievements =====

console.log('Buscando sistemas do RetroAchievements…');
const systems = await api('API_GetConsoleIDs.php', { g: '1', a: '1' });
const systemId = new Map(systems.map((s) => [norm(s.Name), s.ID]));
console.log(`  ${systems.length} sistemas ativos com jogos`);

// Quais consoles precisamos consultar, e quais o RA simplesmente não tem.
const needed = new Set();
const unsupportedConsoles = new Set();
for (const set of consolesOf.values()) {
  for (const name of set) {
    if (systemId.has(norm(name))) needed.add(name);
    else unsupportedConsoles.add(name);
  }
}

if (unsupportedConsoles.size) {
  console.log(`  sem suporte no RA: ${[...unsupportedConsoles].join(', ')}`);
}

// ===== 3. catálogo de cada console =====

/** título normalizado -> jogo, por console. */
const PAGE = 500;

const catalog = new Map();
for (const name of needed) {
  const id = systemId.get(norm(name));

  // A API corta em 500 por chamada mesmo com `c` maior — sem paginar, some
  // tudo que cai depois do corte alfabético (foi assim que HeartGold e
  // SoulSilver sumiram na primeira versão deste script).
  const list = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await api('API_GetGameList.php', {
      i: String(id),
      f: '1',
      c: String(PAGE),
      o: String(offset),
    });
    list.push(...page);
    if (page.length < PAGE) break;
  }

  const byTitle = new Map();
  for (const g of list) {
    // Primeiro título vence: subsets e revisões vêm depois e não devem
    // sobrescrever o jogo base quando normalizam igual.
    if (!byTitle.has(norm(g.Title))) byTitle.set(norm(g.Title), g);
  }
  catalog.set(name, byTitle);
  console.log(`  ${name}: ${list.length} jogos com conquistas`);
}

// ===== 4. casamento =====

const matched = {};
const unsupported = {};
const missing = [];

for (const [slug, consoles] of consolesOf) {
  const candidates = TITLES[slug];

  // Ausência conhecida e explicada: resultado, não falha.
  if (NO_EQUIVALENT[slug]) {
    unsupported[slug] = NO_EQUIVALENT[slug];
    continue;
  }

  // Sem console suportado = não existe no RA, e isso é informação, não falha.
  const usable = [...consoles].filter((c) => catalog.has(c));
  if (!usable.length) {
    unsupported[slug] = `${[...consoles].join(' / ')} — sem jogos com conquistas no RetroAchievements`;
    continue;
  }

  if (!candidates) {
    missing.push({ slug, consoles: usable, reason: 'sem título esperado cadastrado no script' });
    continue;
  }

  let hit = null;
  let hitConsole = null;
  for (const c of usable) {
    const byTitle = catalog.get(c);
    for (const t of candidates) {
      const found = byTitle.get(norm(t));
      if (found) {
        hit = found;
        hitConsole = c;
        break;
      }
    }
    if (hit) break;
  }

  if (hit) {
    matched[slug] = {
      raId: hit.ID,
      raTitle: hit.Title,
      console: hitConsole,
      achievements: hit.NumAchievements ?? 0,
      points: hit.Points ?? 0,
    };
  } else {
    missing.push({ slug, consoles: usable, reason: 'nenhum título bateu' });
  }
}

// ===== 5. saída: edita o campo `retroachievements` de cada jogo direto =====
// Slug que ficou em `missing` (não bateu nada) não é tocado — mantém o que
// já estava no arquivo em vez de arriscar um chute errado.

let written = 0;
for (const [slug, hit] of Object.entries(matched)) {
  await updateMdFrontmatter(gamePathBySlug.get(slug), {
    retroachievements: {
      supported: true,
      raId: hit.raId,
      raTitle: hit.raTitle,
      console: hit.console,
      achievements: hit.achievements,
      points: hit.points,
    },
  });
  written++;
}
for (const [slug, reason] of Object.entries(unsupported)) {
  await updateMdFrontmatter(gamePathBySlug.get(slug), {
    retroachievements: { supported: false, reason },
  });
  written++;
}

console.log(`
✓ ${Object.keys(matched).length} jogos relacionados
· ${Object.keys(unsupported).length} sem equivalente (console fora do RetroAchievements)
→ ${written} arquivos atualizados em src/content/hobbies/pokemon/games/`);

// Falhou algum que era pra bater? Mostra o que existe no console, pra corrigir
// a lista TITLES sem ter que caçar na mão.
if (missing.length) {
  console.log(`\n✗ ${missing.length} não casaram — títulos parecidos no console:`);
  for (const m of missing) {
    console.log(`\n  ${m.slug} (${m.reason})`);
    for (const c of m.consoles) {
      const similar = [...catalog.get(c).values()]
        .filter((g) => norm(g.Title).includes('pokemon') || norm(g.Title).includes('pocket monsters'))
        .slice(0, 12);
      for (const g of similar) console.log(`     [${c}] ${g.Title}`);
    }
  }
  process.exitCode = 1;
}

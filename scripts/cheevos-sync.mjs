// Sincroniza as conquistas do RetroAchievements para dados locais.
// Uso: npm run cheevos:sync
//
// Por que no build e não no navegador (diretriz 2 + 3 do CLAUDE.md):
// o app é offline-first e não tem backend. A API do RetroAchievements exige
// uma chave que não pode ir pro bundle nem pro repositório — então o sync roda
// aqui, na máquina, e o resultado (.md + imagens) é commitado. O site gerado
// não fala com a API em runtime.
//
// Credenciais: crie um `.env` na raiz (já ignorado pelo git) com
//   RA_USERNAME=seu_usuario
//   RA_API_KEY=sua_chave      (retroachievements.org > Settings > Web API Key)
//
// Saída:
//   src/content/hobbies/cheevos/games/<id>.md — jogo + conquistas, tudo num arquivo
//   src/content/hobbies/cheevos/sync.md       — metadado do sync (usuário, quando)
//   public/hobbies/cheevos/games/<id>.png     — ícone do jogo
//   public/hobbies/cheevos/badges/<badge>[_lock].png — badges das conquistas
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeMd } from './lib/content-md.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const GAMES_DIR = join(root, 'src', 'content', 'hobbies', 'cheevos', 'games');
const SYNC_MD = join(root, 'src', 'content', 'hobbies', 'cheevos', 'sync.md');
const ICON_DIR = join(root, 'public', 'hobbies', 'cheevos', 'games');
const BADGE_DIR = join(root, 'public', 'hobbies', 'cheevos', 'badges');

const API = 'https://retroachievements.org/API';
const MEDIA = 'https://media.retroachievements.org';

// A API é pública e gratuita; não vale martelar. 4 em paralelo com retry dá
// conta de centenas de jogos sem tomar 429.
const API_CONCURRENCY = 4;
const IMG_CONCURRENCY = 12;
const PAGE_SIZE = 500;

// ===== credenciais =====

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // sem .env: ainda pode vir do ambiente (ex.: CI)
}

const USER = process.env.RA_USERNAME;
const KEY = process.env.RA_API_KEY;

if (!USER || !KEY) {
  console.error(`
Faltam credenciais do RetroAchievements.

Crie um arquivo .env na raiz do projeto (ele já está no .gitignore):

  RA_USERNAME=seu_usuario
  RA_API_KEY=sua_chave

A chave fica em https://retroachievements.org/settings (Web API Key).
`);
  process.exit(1);
}

// ===== helpers =====

/** GET com retry: a API devolve 429/5xx sob carga, e aí só cabe esperar. */
async function api(endpoint, params, attempt = 1) {
  const qs = new URLSearchParams({ ...params, u: USER, y: KEY });
  const res = await fetch(`${API}/${endpoint}?${qs}`);

  if (res.status === 429 || res.status >= 500) {
    if (attempt > 4) throw new Error(`${endpoint}: HTTP ${res.status} após 4 tentativas`);
    const wait = 1000 * 2 ** (attempt - 1);
    console.log(`  … HTTP ${res.status}, tentando de novo em ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return api(endpoint, params, attempt + 1);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${endpoint}: HTTP ${res.status} — usuário ou chave inválidos`);
  }
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  return res.json();
}

/** Roda `task` sobre `items` com no máximo `limit` em voo. */
async function pool(items, limit, task) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await task(queue.shift());
    }),
  );
}

/** `/Images/074457.png` -> `074457`. */
function iconId(imageIcon) {
  return (imageIcon ?? '').split('/').pop()?.replace(/\.png$/i, '') ?? '';
}

// ===== 1. lista de jogos =====

console.log(`Sincronizando conquistas de "${USER}"…`);

const games = [];
for (let offset = 0; ; offset += PAGE_SIZE) {
  const page = await api('API_GetUserCompletionProgress.php', {
    c: String(PAGE_SIZE),
    o: String(offset),
  });
  games.push(...(page.Results ?? []));
  console.log(`  ${games.length}/${page.Total} jogos listados`);
  if (games.length >= (page.Total ?? 0) || !page.Results?.length) break;
}

if (!games.length) {
  console.error('Nenhum jogo retornado — confira o usuário e a chave.');
  process.exit(1);
}

// ===== 2. conquistas de cada jogo =====

await mkdir(GAMES_DIR, { recursive: true });

const index = [];
const badges = new Set();
let done = 0;
const failures = [];

await pool(games, API_CONCURRENCY, async (g) => {
  try {
    const detail = await api('API_GetGameInfoAndUserProgress.php', { g: String(g.GameID) });

    // `Achievements` vem como objeto indexado por id, não array.
    const achievements = Object.values(detail.Achievements ?? {})
      .map((a) => ({
        id: a.ID,
        title: a.Title,
        description: a.Description,
        points: a.Points ?? 0,
        badge: a.BadgeName,
        // `type` marca progression/win_condition/missable; null = conquista comum.
        type: a.type ?? null,
        order: a.DisplayOrder ?? 0,
        // Guardamos as duas datas: hardcore é o que "vale" no RA, mas o
        // softcore também conta como desbloqueado pra quem joga com savestate.
        earnedAt: a.DateEarned ?? null,
        earnedHardcoreAt: a.DateEarnedHardcore ?? null,
      }))
      .sort((a, b) => a.order - b.order || a.id - b.id);

    for (const a of achievements) if (a.badge) badges.add(a.badge);

    const points = achievements.reduce((s, a) => s + a.points, 0);
    const earnedPoints = achievements
      .filter((a) => a.earnedAt || a.earnedHardcoreAt)
      .reduce((s, a) => s + a.points, 0);

    const summary = {
      id: g.GameID,
      title: g.Title,
      console: g.ConsoleName,
      icon: iconId(g.ImageIcon),
      total: achievements.length,
      earned: achievements.filter((a) => a.earnedAt || a.earnedHardcoreAt).length,
      earnedHardcore: achievements.filter((a) => a.earnedHardcoreAt).length,
      points,
      earnedPoints,
      // "mastered" / "completed" / "beaten-hardcore" / "beaten-softcore" / null
      award: g.HighestAwardKind ?? null,
      awardedAt: g.HighestAwardDate ?? null,
      lastPlayedAt: g.MostRecentAwardedDate ?? null,
    };

    await writeMd(
      join(GAMES_DIR, `${g.GameID}.md`),
      { type: 'cheevos-game', ...summary, achievements },
      `<!-- Conquistas de "${g.Title}". Gerado por cheevos-sync.mjs. -->\n`,
    );

    index.push(summary);
  } catch (err) {
    failures.push(`${g.Title} (${g.GameID}): ${err.message}`);
  }

  done++;
  if (done % 25 === 0 || done === games.length) {
    console.log(`  ${done}/${games.length} jogos detalhados`);
  }
});

// Mais recente primeiro: é o que interessa olhar.
index.sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''));

await writeMd(
  SYNC_MD,
  { type: 'cheevos-sync', user: USER, syncedAt: new Date().toISOString() },
  `<!-- Metadado do último sync — os totais são somados de cheevosGames na leitura, não guardados aqui. -->\n`,
);

// Jogos que sumiram do RA (ou saíram do escopo) não podem ficar de resto.
const validFiles = new Set(index.map((g) => `${g.id}.md`));
for (const f of await readdir(GAMES_DIR).catch(() => [])) {
  if (f.endsWith('.md') && !validFiles.has(f)) {
    await rm(join(GAMES_DIR, f));
  }
}

// ===== 3. imagens (offline: diretriz 2) =====

await mkdir(ICON_DIR, { recursive: true });
await mkdir(BADGE_DIR, { recursive: true });

const haveIcons = new Set(await readdir(ICON_DIR).catch(() => []));
const haveBadges = new Set(await readdir(BADGE_DIR).catch(() => []));

// Badge tem dois estados: colorida (desbloqueada) e cinza (`_lock`). Baixamos
// os dois porque a tela mostra a conquista que ainda falta também.
const downloads = [
  ...index
    .filter((g) => g.icon && !haveIcons.has(`${g.icon}.png`))
    .map((g) => [`${MEDIA}/Images/${g.icon}.png`, join(ICON_DIR, `${g.icon}.png`)]),
  ...[...badges].flatMap((b) =>
    [`${b}.png`, `${b}_lock.png`]
      .filter((f) => !haveBadges.has(f))
      .map((f) => [`${MEDIA}/Badge/${f}`, join(BADGE_DIR, f)]),
  ),
];

console.log(`\n${downloads.length} imagens a baixar (${haveIcons.size + haveBadges.size} já em disco)`);

let imgOk = 0;
const imgFail = [];

await pool(downloads, IMG_CONCURRENCY, async ([url, dest]) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    imgOk++;
    if (imgOk % 200 === 0) console.log(`  ${imgOk}/${downloads.length}…`);
  } catch (err) {
    imgFail.push(`${url}: ${err.message}`);
  }
});

// ===== resumo =====

const t = index.reduce(
  (acc, g) => ({
    achievements: acc.achievements + g.total,
    earned: acc.earned + g.earned,
    points: acc.points + g.earnedPoints,
  }),
  { achievements: 0, earned: 0, points: 0 },
);

console.log(`
✓ ${index.length} jogos · ${t.earned}/${t.achievements} conquistas · ${t.points} pontos
✓ ${imgOk} imagens novas`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} jogos falharam:`);
  failures.slice(0, 10).forEach((f) => console.log('   ', f));
}
if (imgFail.length) {
  console.log(`\n✗ ${imgFail.length} imagens falharam:`);
  imgFail.slice(0, 10).forEach((f) => console.log('   ', f));
}
if (failures.length || imgFail.length) process.exitCode = 1;

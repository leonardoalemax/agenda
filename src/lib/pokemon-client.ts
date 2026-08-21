// Hidrata as telas do hobby Pokémon a partir do IndexedDB.
//
// Posse (Jogos) é por jogo, físico/digital, sem plataforma. Pokedex é por
// save (treinador + jogo); um jogo pode ter vários saves.
import {
  getCheck,
  setCheck,
  getChecksWithPrefix,
  setChecksBulk,
  listSaves,
  getSave,
  createSave,
  renameSave,
  updateTrainerId,
  deleteSave,
  setSaveMovedToHome,
  setSaveCompleted,
  REMOTE_SYNC_EVENT,
  type PokemonSave,
} from './store';
import { ownedKey, caughtKey, marcoKey, spritePath, type Media } from './pokemon-keys';
import { withBase } from './base';
import { ICONS } from './icons';

const CAUGHT_PREFIX = 'pokemon-caught::';

/** Disparado depois que hydrateCompleted() (tela de jogos) termina de ler o IndexedDB. */
const POKEMON_COMPLETED_HYDRATED_EVENT = 'pokemon:completed-hydrated';

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** " · 24h" (ou "12,5h"), ou string vazia se o save não tem horas registradas. */
function hoursLabel(hoursSpent?: number): string {
  if (hoursSpent == null) return '';
  const n = Number.isInteger(hoursSpent) ? String(hoursSpent) : hoursSpent.toFixed(1).replace('.', ',');
  return ` · ${n}h`;
}

// ===== modal de save: escolher jogo (opcional) + formulário treinador =====
//
// Um <dialog> só, criado sob demanda e reaproveitado. No desktop centraliza
// como modal; no mobile (ver CSS global) vira uma folha que sobe do rodapé —
// mesmo componente, dois jeitos de aparecer.

interface GameMeta {
  name: string;
  generation: string;
  total: number;
  cover: string;
  platforms: string[];
  /** Selo de origem (ver originMarkPath em lib/pokemon.ts) — pokemon.ts usa
      astro:content e não pode ser importado aqui (código de cliente), então
      isso vem pré-computado pela página no gameIndex. */
  originMark: string | null;
}

let modalEl: HTMLDialogElement | null = null;

function ensureSaveModal(): HTMLDialogElement {
  if (modalEl) return modalEl;
  const dialog = document.createElement('dialog');
  dialog.className = 'pokemon-modal';
  dialog.innerHTML = `
    <div class="modal-card">
      <header class="modal-header">
        <h2 data-modal-title></h2>
        <button type="button" class="icon-btn" data-modal-close aria-label="Fechar"><span class="icon" style="font-size:18px">${ICONS.x}</span></button>
      </header>
      <div class="modal-body" data-modal-body></div>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-modal-close]')?.addEventListener('click', () => dialog.close());
  // clique fora do cartão (na própria <dialog>, que cobre a tela) fecha
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  modalEl = dialog;
  return dialog;
}

function renderGamePicker(
  dialog: HTMLDialogElement,
  gameIndex: Record<string, GameMeta>,
  onPick: (slug: string) => void,
) {
  const title = dialog.querySelector<HTMLElement>('[data-modal-title]');
  const body = dialog.querySelector<HTMLElement>('[data-modal-body]');
  if (title) title.textContent = 'Escolher jogo';
  if (!body) return;
  body.innerHTML = `
    <div class="modal-game-list">
      ${Object.entries(gameIndex)
        .map(
          ([slug, meta]) => `
        <button type="button" class="modal-game-row" data-pick-game="${slug}">
          <img src="${withBase(meta.cover)}" alt="" width="80" height="80" loading="lazy" decoding="async" />
          <span>${escapeHtml(meta.name)}</span>
        </button>`,
        )
        .join('')}
    </div>
  `;
  body
    .querySelectorAll<HTMLButtonElement>('[data-pick-game]')
    .forEach((b) => b.addEventListener('click', () => onPick(b.getAttribute('data-pick-game')!)));
}

function renderSaveForm(
  dialog: HTMLDialogElement,
  opts: {
    gameLabel: string;
    mode: 'create' | 'edit';
    trainerId?: string;
    trainerName?: string;
    platforms: string[];
    platform?: string;
    hoursSpent?: number;
    onBack?: () => void;
    onSubmit: (trainerId: string, trainerName: string, platform: string, hoursSpent?: number) => void;
  },
) {
  const title = dialog.querySelector<HTMLElement>('[data-modal-title]');
  const body = dialog.querySelector<HTMLElement>('[data-modal-body]');
  if (title) title.textContent = opts.mode === 'create' ? 'Novo save' : 'Editar save';
  if (!body) return;
  body.innerHTML = `
    <form data-save-form>
      <p class="hint modal-game-label">${escapeHtml(opts.gameLabel)}</p>
      <label class="modal-field">
        <span>ID do treinador</span>
        <input type="text" name="trainerId" required autocomplete="off"
          value="${escapeHtml(opts.trainerId ?? '')}" placeholder="ex.: ash-kanto" />
      </label>
      <label class="modal-field">
        <span>Nome do treinador (opcional)</span>
        <input type="text" name="trainerName" autocomplete="off"
          value="${escapeHtml(opts.trainerName ?? '')}" placeholder="ex.: Ash Ketchum" />
      </label>
      <label class="modal-field">
        <span>Plataforma</span>
        <select name="platform">
          ${opts.platforms
            .map(
              (p) => `<option value="${escapeHtml(p)}"${p === opts.platform ? ' selected' : ''}>${escapeHtml(p)}</option>`,
            )
            .join('')}
        </select>
      </label>
      <label class="modal-field">
        <span>Horas jogadas (opcional)</span>
        <input type="number" name="hoursSpent" min="0" step="0.5" inputmode="decimal"
          value="${opts.hoursSpent != null ? opts.hoursSpent : ''}" placeholder="ex.: 24" />
      </label>
      <div class="modal-actions">
        ${opts.onBack ? '<button type="button" class="btn" data-modal-back>‹ voltar</button>' : '<span></span>'}
        <button type="submit" class="btn primary">${opts.mode === 'create' ? 'Criar save' : 'Salvar'}</button>
      </div>
    </form>
  `;
  const form = body.querySelector<HTMLFormElement>('[data-save-form]');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const trainerId = String(fd.get('trainerId') || '').trim();
    const trainerName = String(fd.get('trainerName') || '').trim();
    const platform = String(fd.get('platform') || '').trim();
    const hoursRaw = String(fd.get('hoursSpent') || '').trim();
    const hoursSpent = hoursRaw ? Number(hoursRaw) : undefined;
    if (!trainerId) return;
    if (hoursSpent != null && Number.isNaN(hoursSpent)) return;
    opts.onSubmit(trainerId, trainerName, platform, hoursSpent);
  });
  if (opts.onBack) {
    body.querySelector('[data-modal-back]')?.addEventListener('click', opts.onBack);
    (form?.elements.namedItem('trainerId') as HTMLInputElement | null)?.focus();
  } else {
    (form?.elements.namedItem('trainerId') as HTMLInputElement | null)?.focus();
  }
}

/**
 * Fluxo de criação: sem `game` fixo, abre a lista de jogos primeiro (com
 * capa de cada um) e só então o formulário; com `game` fixo (página do
 * jogo), pula direto pro formulário.
 */
function openNewSaveModal(params: {
  game?: string;
  gameLabel?: string;
  platforms?: string[];
  gameIndex?: Record<string, GameMeta>;
  onCreated: (save: PokemonSave) => void;
}) {
  const dialog = ensureSaveModal();

  function showForm(game: string, gameLabel: string, platforms: string[], showBack: boolean) {
    renderSaveForm(dialog, {
      gameLabel,
      mode: 'create',
      platforms,
      onBack: showBack ? showPicker : undefined,
      onSubmit: async (trainerId, trainerName, platform, hoursSpent) => {
        const save = await createSave(game, trainerName || undefined, trainerId, platform || undefined, hoursSpent);
        dialog.close();
        params.onCreated(save);
      },
    });
  }

  function showPicker() {
    renderGamePicker(dialog, params.gameIndex ?? {}, (slug) => {
      const meta = params.gameIndex?.[slug];
      showForm(slug, meta?.name ?? slug, meta?.platforms ?? [], true);
    });
  }

  if (params.game) {
    showForm(params.game, params.gameLabel ?? params.game, params.platforms ?? [], false);
  } else {
    showPicker();
  }

  dialog.showModal();
}

/** Fluxo de edição: sempre direto pro formulário, pré-preenchido. */
function openEditSaveModal(
  save: PokemonSave,
  gameLabel: string,
  platforms: string[],
  onSaved: (newTrainerId: string) => void,
) {
  const dialog = ensureSaveModal();
  renderSaveForm(dialog, {
    gameLabel,
    mode: 'edit',
    trainerId: save.trainerId,
    trainerName: save.trainerName,
    platforms,
    platform: save.platform,
    hoursSpent: save.hoursSpent,
    onSubmit: async (trainerId, trainerName, platform, hoursSpent) => {
      if (trainerId !== save.trainerId) await updateTrainerId(save.trainerId, trainerId);
      await renameSave(trainerId, trainerName || undefined, platform || undefined, hoursSpent);
      dialog.close();
      onSaved(trainerId);
    },
  });
  dialog.showModal();
}

// ===== tela de jogos (posse) =====

export function initPokemonGames() {
  const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-owned]'));
  if (!boxes.length) return;

  const ownedCount = document.querySelector<HTMLElement>('[data-owned-count]');
  const gameArticles = Array.from(document.querySelectorAll<HTMLElement>('.game[data-game]'));
  const dexProgressRows = Array.from(document.querySelectorAll<HTMLElement>('[data-dex-progress]'));
  const marcoProgressRows = Array.from(document.querySelectorAll<HTMLElement>('[data-marcos-progress]'));

  function parse(box: HTMLInputElement): { game: string; media: Media } {
    const [game, media] = (box.getAttribute('data-owned') || '').split('::');
    return { game, media: media as Media };
  }

  function updateOwnedCount() {
    if (!ownedCount) return;
    const games = new Set<string>();
    for (const box of boxes) if (box.checked) games.add(parse(box).game);
    ownedCount.textContent = String(games.size);
  }

  async function hydrate() {
    await Promise.all(
      boxes.map(async (box) => {
        const { game, media } = parse(box);
        box.checked = Boolean(await getCheck(ownedKey(game, media)));
      }),
    );
    updateOwnedCount();
  }

  // "Completo" não tem mais ícone próprio aqui — é só o filtro "Finalizados"
  // lendo data-completed, que initPokemonSavePage() já mantém em dia (100%
  // dos marcos do save = completo). O sinal visual na lista é a barra de
  // marcos abaixo batendo 100%.
  async function hydrateCompleted() {
    if (!gameArticles.length) return;
    const saves = await listSaves();
    const completedGames = new Set(saves.filter((s) => s.completed).map((s) => s.game));
    for (const article of gameArticles) {
      article.dataset.completed = String(completedGames.has(article.dataset.game || ''));
    }
    document.dispatchEvent(new CustomEvent(POKEMON_COMPLETED_HYDRATED_EVENT));
  }

  // Progresso de captura por jogo: união dos pokémon marcados em TODOS os
  // saves daquele jogo (não um save específico) ÷ tamanho da dex do jogo.
  async function hydrateDexProgress() {
    if (!dexProgressRows.length) return;
    const saves = await listSaves();
    const caughtByGame = new Map<string, Set<string>>();
    await Promise.all(
      saves.map(async (save) => {
        const prefix = `${CAUGHT_PREFIX}${save.trainerId}::`;
        const caught = await getChecksWithPrefix(prefix);
        let species = caughtByGame.get(save.game);
        if (!species) {
          species = new Set();
          caughtByGame.set(save.game, species);
        }
        for (const [key, value] of Object.entries(caught)) {
          if (value) species.add(key.slice(prefix.length));
        }
      }),
    );
    for (const row of dexProgressRows) {
      const slug = row.closest<HTMLElement>('.game')?.dataset.game;
      const total = Number(row.getAttribute('data-dex-total') || 0);
      const n = (slug && caughtByGame.get(slug)?.size) || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const bar = row.querySelector<HTMLElement>('[data-dex-bar]');
      const label = row.querySelector<HTMLElement>('[data-dex-label]');
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = `${n}/${total}`;
      row.querySelector('[data-dex-track]')?.setAttribute('aria-valuenow', String(pct));
      row.title = `${n} de ${total} pokémon capturados`;
      row.classList.toggle('empty', n === 0);
    }
  }

  // Mesma lógica da barra de captura, mas pra marcos (insígnias etc.):
  // união dos marcos feitos em TODOS os saves daquele jogo ÷ total cadastrado.
  async function hydrateMarcoProgress() {
    if (!marcoProgressRows.length) return;
    const saves = await listSaves();
    const doneByGame = new Map<string, Set<string>>();
    await Promise.all(
      saves.map(async (save) => {
        const prefix = `pokemon-marco::${save.trainerId}::`;
        const done = await getChecksWithPrefix(prefix);
        let ids = doneByGame.get(save.game);
        if (!ids) {
          ids = new Set();
          doneByGame.set(save.game, ids);
        }
        for (const [key, value] of Object.entries(done)) {
          if (value) ids.add(key.slice(prefix.length));
        }
      }),
    );
    for (const row of marcoProgressRows) {
      const slug = row.closest<HTMLElement>('.game')?.dataset.game;
      const total = Number(row.getAttribute('data-marcos-total') || 0);
      const n = (slug && doneByGame.get(slug)?.size) || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const bar = row.querySelector<HTMLElement>('[data-marcos-bar]');
      const label = row.querySelector<HTMLElement>('[data-marcos-label]');
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = `${n}/${total}`;
      row.querySelector('[data-marcos-track]')?.setAttribute('aria-valuenow', String(pct));
      row.title = `${n} de ${total} marcos completados`;
      row.classList.toggle('empty', n === 0);
    }
  }

  boxes.forEach((box) => {
    box.addEventListener('change', () => {
      const { game, media } = parse(box);
      setCheck(ownedKey(game, media), box.checked);
      updateOwnedCount();
    });
  });

  hydrate();
  hydrateCompleted();
  hydrateDexProgress();
  hydrateMarcoProgress();
  window.addEventListener(REMOTE_SYNC_EVENT, () => {
    hydrate();
    hydrateCompleted();
    hydrateDexProgress();
    hydrateMarcoProgress();
  });
}

/**
 * Card inteiro navega pro save do jogo — exceto cliques nos toggles de
 * físico/digital (checkbox) ou no link "ver saves" explícito, que já
 * navegam por conta própria e não podem disparar isso de novo.
 */
export function initPokemonGameCards() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.game[data-href]'));
  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.media-toggle') || target.closest('a')) return;
      const href = card.getAttribute('data-href');
      if (href) location.href = href;
    });
  });
}

// ===== tela de jogos: filtro por transferência, conquistas e finalizados =====
//
// Cada <article class="game"> traz data-bank/data-home/data-transport/
// data-cheevos renderizados no build (estático) e data-completed hidratado
// no cliente por initPokemonGames() a partir dos saves no IndexedDB (dinâmico
// — reflete se algum save do jogo está marcado como completo). O filtro só
// esconde/mostra no cliente — combinação é "E": com vários filtros ativos,
// só aparece jogo que atende todos.

export function initPokemonGameFilters() {
  const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-transfer-filter]'));
  if (!chips.length) return;

  const games = Array.from(document.querySelectorAll<HTMLElement>('.game'));
  const gens = Array.from(document.querySelectorAll<HTMLElement>('[data-gen]'));
  const emptyHint = document.querySelector<HTMLElement>('[data-filter-empty]');
  const active = new Set<string>();

  function apply() {
    let anyVisible = false;
    for (const game of games) {
      const matches = Array.from(active).every((key) => game.dataset[key] === 'true');
      game.hidden = active.size > 0 && !matches;
      if (!game.hidden) anyVisible = true;
    }
    for (const gen of gens) {
      const hasVisible = Array.from(gen.querySelectorAll<HTMLElement>('.game')).some((g) => !g.hidden);
      gen.hidden = !hasVisible;
    }
    if (emptyHint) emptyHint.hidden = anyVisible || active.size === 0;
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.getAttribute('data-transfer-filter')!;
      if (active.has(key)) active.delete(key);
      else active.add(key);
      chip.setAttribute('aria-pressed', String(active.has(key)));
      apply();
    });
  });

  // data-completed chega depois (async, via IndexedDB) — reaplica se algum
  // filtro já estiver ativo quando a hidratação terminar.
  document.addEventListener(POKEMON_COMPLETED_HYDRATED_EVENT, () => {
    if (active.size > 0) apply();
  });
}

// ===== tela de UM save em /saves/<game>/?save=<trainerId>: pokedex desse save =====
//
// Esta página é sempre relativa a um único save, identificado por `?save=`
// na URL. Escolher entre vários saves do mesmo jogo é responsabilidade da
// listagem em /hobbies/pokemon/saves/ — aqui não há seletor nem fallback
// pra "o mais recente"; sem `?save=` válido, mostra estado vazio apontando
// pra lista.

export function initPokemonSavePage() {
  const root = document.querySelector<HTMLElement>('[data-saves-root]');
  if (!root) return;
  const game = root.getAttribute('data-game') || '';
  const gameLabel = root.getAttribute('data-game-label') || game;
  const platforms: string[] = JSON.parse(root.getAttribute('data-game-platforms') || '[]');

  const dexWrap = document.querySelector<HTMLElement>('[data-dex-wrap]');
  const noSaveMsg = document.querySelector<HTMLElement>('[data-no-save-msg]');
  const trainerLine = document.querySelector<HTMLElement>('[data-trainer-line]');
  const trainerNameEl = document.querySelector<HTMLElement>('[data-trainer-name]');
  const trainerIdEl = document.querySelector<HTMLElement>('[data-trainer-id]');
  const trainerPlatformEl = document.querySelector<HTMLElement>('[data-trainer-platform]');
  const movedHomeBtn = document.querySelector<HTMLButtonElement>('[data-moved-home]');
  const monButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-caught]'));
  const bar = document.querySelector<HTMLElement>('[data-progress-bar]');
  const track = document.querySelector<HTMLElement>('[data-progress-track]');
  const progressLabel = document.querySelector<HTMLElement>('[data-progress-label]');
  const monSearch = document.querySelector<HTMLInputElement>('[data-mon-search]');
  const monSearchEmpty = document.querySelector<HTMLElement>('[data-mon-search-empty]');
  const boxes = Array.from(document.querySelectorAll<HTMLElement>('.box'));

  const marcoButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-marco-toggle]'));
  const marcoBar = document.querySelector<HTMLElement>('[data-marco-progress-bar]');
  const marcoTrack = document.querySelector<HTMLElement>('[data-marco-progress-track]');
  const marcoProgressLabel = document.querySelector<HTMLElement>('[data-marco-progress-label]');

  const monEntries = monButtons.map((btn) => {
    const li = btn.closest<HTMLElement>('[data-mon]')!;
    const name = (btn.getAttribute('aria-label') || '').toLowerCase();
    const num = (li.querySelector('.mon-num')?.textContent || '').replace('#', '');
    return { li, name, num: num.toLowerCase(), numTrimmed: num.replace(/^0+/, '') };
  });

  function applyMonFilter() {
    const q = (monSearch?.value || '').trim().toLowerCase();
    let anyVisible = false;
    for (const entry of monEntries) {
      const match = !q || entry.name.includes(q) || entry.num.includes(q) || entry.numTrimmed.includes(q);
      entry.li.hidden = !match;
      if (match) anyVisible = true;
    }
    for (const box of boxes) {
      box.hidden = !box.querySelector('[data-mon]:not([hidden])');
    }
    if (monSearchEmpty) monSearchEmpty.hidden = !q || anyVisible;
  }

  monSearch?.addEventListener('input', applyMonFilter);

  function isCaught(btn: HTMLButtonElement): boolean {
    return btn.getAttribute('aria-pressed') === 'true';
  }
  function setCaught(btn: HTMLButtonElement, value: boolean): void {
    btn.setAttribute('aria-pressed', String(value));
    btn.closest('[data-mon]')?.classList.toggle('caught', value);
  }

  function isMarcoDone(btn: HTMLButtonElement): boolean {
    return btn.getAttribute('aria-pressed') === 'true';
  }
  function setMarcoDone(btn: HTMLButtonElement, value: boolean): void {
    btn.setAttribute('aria-pressed', String(value));
  }
  function updateMarcoProgress(doneCount: number) {
    const pct = marcoButtons.length ? Math.round((doneCount / marcoButtons.length) * 100) : 0;
    if (marcoBar) marcoBar.style.width = `${pct}%`;
    if (marcoProgressLabel) marcoProgressLabel.textContent = `${doneCount}/${marcoButtons.length} — ${pct}%`;
    marcoTrack?.setAttribute('aria-valuenow', String(pct));
  }

  let activeSave: PokemonSave | null = null;

  function updateProgress(caughtCount: number) {
    const pct = monButtons.length ? Math.round((caughtCount / monButtons.length) * 100) : 0;
    if (bar) bar.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `${caughtCount}/${monButtons.length} — ${pct}%`;
    track?.setAttribute('aria-valuenow', String(pct));
  }

  async function hydrateDex() {
    if (!activeSave) return;
    const saved = await getChecksWithPrefix(`${CAUGHT_PREFIX}${activeSave.trainerId}::`);
    let n = 0;
    for (const btn of monButtons) {
      const species = btn.getAttribute('data-caught') || '';
      const v = Boolean(saved[caughtKey(activeSave.trainerId, species)]);
      setCaught(btn, v);
      if (v) n++;
    }
    updateProgress(n);
  }

  async function hydrateMarcos() {
    if (!activeSave || !marcoButtons.length) return;
    const saved = await getChecksWithPrefix(`pokemon-marco::${activeSave.trainerId}::`);
    let n = 0;
    for (const btn of marcoButtons) {
      const id = btn.getAttribute('data-marco-toggle') || '';
      const v = Boolean(saved[marcoKey(activeSave.trainerId, id)]);
      setMarcoDone(btn, v);
      if (v) n++;
    }
    updateMarcoProgress(n);
    await syncCompletedFromMarcos();
  }

  /**
   * "Completo" não é mais um botão manual — é derivado: 100% dos marcos
   * cadastrados pro jogo feitos neste save = completo. Jogo sem marco
   * cadastrado (ex.: Colosseum/XD) nunca vira completo por aqui, já que
   * não há como saber; o campo só existe pra alimentar a lista de jogos
   * (badge "Finalizados") e o card de save em /saves/.
   */
  async function syncCompletedFromMarcos() {
    if (!activeSave || !marcoButtons.length) return;
    const allDone = marcoButtons.every(isMarcoDone);
    if (activeSave.completed === allDone) return;
    activeSave.completed = allDone;
    await setSaveCompleted(activeSave.trainerId, allDone);
  }

  function setUrlTrainerId(trainerId: string) {
    const u = new URL(location.href);
    u.searchParams.set('save', trainerId);
    history.replaceState(null, '', u.toString());
  }

  async function load() {
    const trainerId = new URL(location.href).searchParams.get('save');
    const found = trainerId ? await getSave(trainerId) : undefined;
    activeSave = found && found.game === game ? found : null;

    if (!activeSave) {
      if (dexWrap) dexWrap.hidden = true;
      if (trainerLine) trainerLine.hidden = true;
      if (noSaveMsg) noSaveMsg.hidden = false;
      return;
    }

    if (trainerNameEl) trainerNameEl.textContent = activeSave.trainerName || '(sem nome)';
    if (trainerIdEl) trainerIdEl.textContent = activeSave.trainerId;
    if (trainerPlatformEl) {
      trainerPlatformEl.textContent = (activeSave.platform ? ` · ${activeSave.platform}` : '') + hoursLabel(activeSave.hoursSpent);
    }
    if (movedHomeBtn) movedHomeBtn.setAttribute('aria-pressed', String(Boolean(activeSave.movedToHome)));
    if (trainerLine) trainerLine.hidden = false;
    if (dexWrap) dexWrap.hidden = false;
    if (noSaveMsg) noSaveMsg.hidden = true;
    await hydrateDex();
    await hydrateMarcos();
  }

  monButtons.forEach((btn) => {
    const species = btn.getAttribute('data-caught') || '';
    btn.addEventListener('click', () => {
      if (!activeSave) return;
      const next = !isCaught(btn);
      setCaught(btn, next);
      setCheck(caughtKey(activeSave.trainerId, species), next);
      updateProgress(monButtons.filter(isCaught).length);
    });
  });

  marcoButtons.forEach((btn) => {
    const id = btn.getAttribute('data-marco-toggle') || '';
    btn.addEventListener('click', async () => {
      if (!activeSave) return;
      const next = !isMarcoDone(btn);
      setMarcoDone(btn, next);
      setCheck(marcoKey(activeSave.trainerId, id), next);
      updateMarcoProgress(marcoButtons.filter(isMarcoDone).length);
      await syncCompletedFromMarcos();
    });
  });

  document.querySelector('[data-rename-active]')?.addEventListener('click', () => {
    if (!activeSave) return;
    openEditSaveModal(activeSave, gameLabel, platforms, async (newTrainerId) => {
      setUrlTrainerId(newTrainerId);
      await load();
    });
  });

  movedHomeBtn?.addEventListener('click', () => {
    if (!activeSave) return;
    activeSave.movedToHome = !activeSave.movedToHome;
    movedHomeBtn.setAttribute('aria-pressed', String(activeSave.movedToHome));
    setSaveMovedToHome(activeSave.trainerId, activeSave.movedToHome);
  });

  document.querySelector('[data-delete-active]')?.addEventListener('click', async () => {
    if (!activeSave) return;
    if (!confirm(`Apagar o save "${activeSave.trainerName ?? '(sem nome)'}"? Os pokémon marcados dele somem junto.`)) return;
    await deleteSave(activeSave.trainerId);
    location.href = withBase('hobbies/pokemon/saves');
  });

  document.querySelector('[data-check-all]')?.addEventListener('click', async () => {
    if (!activeSave) return;
    const keys = monButtons.map((b) => caughtKey(activeSave!.trainerId, b.getAttribute('data-caught') || ''));
    await setChecksBulk(keys, true);
    for (const btn of monButtons) setCaught(btn, true);
    updateProgress(monButtons.length);
  });

  document.querySelector('[data-uncheck-all]')?.addEventListener('click', async () => {
    if (!activeSave) return;
    if (monButtons.some(isCaught) && !confirm(`Desmarcar os ${monButtons.length} pokémon deste save?`)) return;
    const keys = monButtons.map((b) => caughtKey(activeSave!.trainerId, b.getAttribute('data-caught') || ''));
    await setChecksBulk(keys, false);
    for (const btn of monButtons) setCaught(btn, false);
    updateProgress(0);
  });

  document.querySelector('[data-marco-check-all]')?.addEventListener('click', async () => {
    if (!activeSave) return;
    const keys = marcoButtons.map((b) => marcoKey(activeSave!.trainerId, b.getAttribute('data-marco-toggle') || ''));
    await setChecksBulk(keys, true);
    for (const btn of marcoButtons) setMarcoDone(btn, true);
    updateMarcoProgress(marcoButtons.length);
    await syncCompletedFromMarcos();
  });

  document.querySelector('[data-marco-uncheck-all]')?.addEventListener('click', async () => {
    if (!activeSave) return;
    if (marcoButtons.some(isMarcoDone) && !confirm(`Desmarcar os ${marcoButtons.length} marcos deste save?`)) return;
    const keys = marcoButtons.map((b) => marcoKey(activeSave!.trainerId, b.getAttribute('data-marco-toggle') || ''));
    await setChecksBulk(keys, false);
    for (const btn of marcoButtons) setMarcoDone(btn, false);
    updateMarcoProgress(0);
    await syncCompletedFromMarcos();
  });

  load();
  window.addEventListener(REMOTE_SYNC_EVENT, load);
}

// ===== tela /saves/: visão geral + criar save =====

export function initPokemonSavesOverview() {
  const container = document.querySelector<HTMLElement>('[data-saves-overview]');
  if (!container) return;

  const gameIndex: Record<string, GameMeta> = (window as unknown as { __pokemonGameIndex?: Record<string, GameMeta> })
    .__pokemonGameIndex ?? {};

  const newBtn = document.querySelector<HTMLButtonElement>('[data-new-save-btn]');
  const gameFilter = document.querySelector<HTMLSelectElement>('[data-game-filter]');

  // Filtro por jogo: vem da URL (?game=<slug>), pra "ver saves" na tela de
  // Jogos linkar direto pra cá já filtrado. Trocar o filtro atualiza a URL
  // sem navegar (replaceState), pra dar pra favoritar/voltar.
  const filterFromUrl = new URL(location.href).searchParams.get('game') || '';
  if (gameFilter) gameFilter.value = filterFromUrl;

  newBtn?.addEventListener('click', () => {
    // Filtrado por um jogo específico (ex.: veio de "ver saves" na tela de
    // Jogos) → pula a etapa de escolher o jogo, já abre o formulário dele.
    const selectedGame = gameFilter?.value || '';
    const meta = selectedGame ? gameIndex[selectedGame] : undefined;
    openNewSaveModal({
      game: selectedGame || undefined,
      gameLabel: meta?.name,
      platforms: meta?.platforms,
      gameIndex,
      onCreated: (save) => {
        location.href = withBase(`hobbies/pokemon/saves/${save.game}/?save=${save.trainerId}`);
      },
    });
  });

  gameFilter?.addEventListener('change', () => {
    const u = new URL(location.href);
    if (gameFilter.value) u.searchParams.set('game', gameFilter.value);
    else u.searchParams.delete('game');
    history.replaceState(null, '', u.toString());
    render();
  });

  async function render() {
    const saves = await listSaves();
    const selectedGame = gameFilter?.value || '';
    const filtered = selectedGame ? saves.filter((s) => s.game === selectedGame) : saves;

    if (!saves.length) {
      container!.innerHTML = '<p class="hint">Nenhum save ainda. Escolha um jogo acima e crie o primeiro.</p>';
      return;
    }
    if (!filtered.length) {
      const gameLabel = gameIndex[selectedGame]?.name ?? selectedGame;
      container!.innerHTML = `<p class="hint">Nenhum save de ${escapeHtml(gameLabel)} ainda.</p>`;
      return;
    }

    const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    const rows = await Promise.all(
      sorted.map(async (s) => {
        const meta = gameIndex[s.game] ?? { name: s.game, generation: '', total: 0, cover: '', platforms: [], originMark: null };
        const caught = await getChecksWithPrefix(`${CAUGHT_PREFIX}${s.trainerId}::`);
        const n = Object.values(caught).filter(Boolean).length;
        const pct = meta.total ? Math.round((n / meta.total) * 100) : 0;
        const href = withBase(`hobbies/pokemon/saves/${s.game}/?save=${s.trainerId}`);
        return `
          <a class="save-card" href="${href}">
            <img class="save-cover" src="${withBase(meta.cover)}" alt="" width="400" height="400" loading="lazy" decoding="async" />
            <div class="save-card-info">
              <strong>${escapeHtml(s.trainerName || '(sem nome)')}</strong>
              <span class="hint">${escapeHtml(meta.name)}${s.platform ? ` · ${escapeHtml(s.platform)}` : ''}${hoursLabel(s.hoursSpent)}</span>
              <span class="trainer-id">@${escapeHtml(s.trainerId)}</span>
            </div>
            ${s.movedToHome ? `<span class="home-icon" title="Movido pro HOME" aria-label="Movido pro HOME">${ICONS.house}</span>` : ''}
            ${s.completed ? `<span class="completed-icon" title="Completado" aria-label="Completado">${ICONS['monitor-check']}</span>` : ''}
            <div class="save-card-progress">
              <div class="progress"><span style="width:${pct}%"></span></div>
              <span class="hint">${n}/${meta.total} — ${pct}%</span>
            </div>
            <span class="save-card-arrow">›</span>
          </a>`;
      }),
    );
    container!.innerHTML = rows.join('');
  }

  render();
  window.addEventListener(REMOTE_SYNC_EVENT, render);
}

// ===== tela /home/: pokémon transferidos, por save marcado como "movido pro HOME" =====
//
// A transferência é por save inteiro (checkbox `movedToHome`), não por
// pokémon — então aqui é só: pra cada save marcado, mostra a caixa desse
// jogo com o que esse save tem capturado. A dex de cada jogo vem de um
// endpoint estático por jogo (dex-data/<game>.json, gerado no build) em vez
// de embutida na página — evita carregar a dex dos 48 jogos de uma vez só
// pra mostrar talvez 1 ou 2.
//
// O layout de caixa do HOME é sempre o mesmo (6×5 = 30), igual o Pokémon
// HOME de verdade — não copia o box-layout do jogo de origem (que varia:
// grade, lista, sem caixa). Por isso `layout` do endpoint é ignorado aqui.

const HOME_LAYOUT = { cols: 6, perBox: 30 } as const;

interface DexDataResponse {
  game: string;
  layout: { cols: number; perBox: number; type: 'graphic-grid' | 'icon-list' | 'infinite-list' };
  entries: Array<{ number: number; species: string; name: string; id: number }>;
}

const dexDataCache = new Map<string, Promise<DexDataResponse>>();

function fetchDexData(game: string): Promise<DexDataResponse> {
  let p = dexDataCache.get(game);
  if (!p) {
    p = fetch(withBase(`hobbies/pokemon/dex-data/${game}.json`)).then((r) => r.json());
    dexDataCache.set(game, p);
  }
  return p;
}

export function initPokemonHomePage() {
  const container = document.querySelector<HTMLElement>('[data-home-list]');
  if (!container) return;

  const emptyMsg = document.querySelector<HTMLElement>('[data-home-empty]');
  const gameIndex: Record<string, GameMeta> = (window as unknown as { __pokemonGameIndex?: Record<string, GameMeta> })
    .__pokemonGameIndex ?? {};

  async function render() {
    const saves = await listSaves();
    const homeSaves = saves.filter((s) => s.movedToHome).sort((a, b) => b.createdAt - a.createdAt);

    if (!homeSaves.length) {
      container!.innerHTML = '';
      if (emptyMsg) emptyMsg.hidden = false;
      return;
    }
    if (emptyMsg) emptyMsg.hidden = true;

    const sections = await Promise.all(
      homeSaves.map(async (s) => {
        const meta = gameIndex[s.game] ?? { name: s.game, generation: '', total: 0, cover: '', platforms: [], originMark: null };
        const [dexData, caught] = await Promise.all([
          fetchDexData(s.game),
          getChecksWithPrefix(`${CAUGHT_PREFIX}${s.trainerId}::`),
        ]);

        const { entries } = dexData;
        const boxes: DexDataResponse['entries'][] = [];
        for (let i = 0; i < entries.length; i += HOME_LAYOUT.perBox) {
          boxes.push(entries.slice(i, i + HOME_LAYOUT.perBox));
        }
        const showBoxes = boxes.length > 1;

        const n = Object.values(caught).filter(Boolean).length;
        const href = withBase(`hobbies/pokemon/saves/${s.game}/?save=${s.trainerId}`);

        const boxesHtml = boxes
          .map(
            (box, i) => `
            <section class="home-box">
              ${showBoxes ? `<h3 class="home-box-title">Caixa ${i + 1}</h3>` : ''}
              <ul class="home-box-items">
                ${box
                  .map((e) => {
                    const isCaught = Boolean(caught[caughtKey(s.trainerId, e.species)]);
                    const markPath = meta.originMark ? withBase(meta.originMark) : null;
                    return `
                    <li class="home-mon${isCaught ? ' caught' : ''}">
                      <div class="home-mon-sprite-wrapper">
                        <img class="home-mon-sprite" src="${withBase(spritePath(e.id))}" alt="" width="56" height="56" loading="lazy" decoding="async" />
                        ${markPath ? `<img class="home-mon-origin-mark" src="${markPath}" alt="" width="16" height="16" loading="lazy" decoding="async" />` : ''}
                      </div>
                      <span class="home-mon-num">#${String(e.number).padStart(3, '0')}</span>
                      <span class="home-mon-name">${escapeHtml(e.name)}</span>
                    </li>`;
                  })
                  .join('')}
                ${Array.from({ length: HOME_LAYOUT.perBox - box.length })
                  .map(() => '<li class="home-mon empty" aria-hidden="true"></li>')
                  .join('')}
              </ul>
            </section>`,
          )
          .join('');

        return `
          <section class="home-save">
            <div class="home-save-header">
              <img class="home-save-cover" src="${withBase(meta.cover)}" alt="" width="400" height="400" loading="lazy" decoding="async" />
              <div class="home-save-info">
                <strong><a href="${href}">${escapeHtml(s.trainerName || '(sem nome)')}</a></strong>
                <span class="hint">${escapeHtml(meta.name)}${s.platform ? ` · ${escapeHtml(s.platform)}` : ''}${hoursLabel(s.hoursSpent)} · @${escapeHtml(s.trainerId)}</span>
              </div>
              <span class="home-save-progress">${n}/${entries.length}</span>
            </div>
            <div class="home-dex" style="--cols:${HOME_LAYOUT.cols}">
              ${boxesHtml}
            </div>
          </section>`;
      }),
    );

    container!.innerHTML = sections.join('');
  }

  render();
  window.addEventListener(REMOTE_SYNC_EVENT, render);
}

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
  REMOTE_SYNC_EVENT,
  type PokemonSave,
} from './store';
import { ownedKey, caughtKey, spritePath, type Media } from './pokemon';
import { withBase } from './base';

const CAUGHT_PREFIX = 'pokemon-caught::';

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
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
        <button type="button" class="icon-btn" data-modal-close aria-label="Fechar">✕</button>
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
    onBack?: () => void;
    onSubmit: (trainerId: string, trainerName: string, platform: string) => void;
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
    if (!trainerId) return;
    opts.onSubmit(trainerId, trainerName, platform);
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
      onSubmit: async (trainerId, trainerName, platform) => {
        const save = await createSave(game, trainerName || undefined, trainerId, platform || undefined);
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
    onSubmit: async (trainerId, trainerName, platform) => {
      if (trainerId !== save.trainerId) await updateTrainerId(save.trainerId, trainerId);
      await renameSave(trainerId, trainerName || undefined, platform || undefined);
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

  boxes.forEach((box) => {
    box.addEventListener('change', () => {
      const { game, media } = parse(box);
      setCheck(ownedKey(game, media), box.checked);
      updateOwnedCount();
    });
  });

  hydrate();
  window.addEventListener(REMOTE_SYNC_EVENT, hydrate);
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
  const completedBtn = document.querySelector<HTMLButtonElement>('[data-completed]');
  const monButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-caught]'));
  const bar = document.querySelector<HTMLElement>('[data-progress-bar]');
  const track = document.querySelector<HTMLElement>('[data-progress-track]');
  const progressLabel = document.querySelector<HTMLElement>('[data-progress-label]');
  const monSearch = document.querySelector<HTMLInputElement>('[data-mon-search]');
  const monSearchEmpty = document.querySelector<HTMLElement>('[data-mon-search-empty]');
  const boxes = Array.from(document.querySelectorAll<HTMLElement>('.box'));

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
    if (trainerPlatformEl) trainerPlatformEl.textContent = activeSave.platform ? ` · ${activeSave.platform}` : '';
    if (movedHomeBtn) movedHomeBtn.setAttribute('aria-pressed', String(Boolean(activeSave.movedToHome)));
    if (completedBtn) completedBtn.setAttribute('aria-pressed', String(Boolean(activeSave.completed)));
    if (trainerLine) trainerLine.hidden = false;
    if (dexWrap) dexWrap.hidden = false;
    if (noSaveMsg) noSaveMsg.hidden = true;
    await hydrateDex();
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

  completedBtn?.addEventListener('click', () => {
    if (!activeSave) return;
    activeSave.completed = !activeSave.completed;
    completedBtn.setAttribute('aria-pressed', String(activeSave.completed));
    setSaveCompleted(activeSave.trainerId, activeSave.completed);
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
    openNewSaveModal({
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
        const meta = gameIndex[s.game] ?? { name: s.game, generation: '', total: 0, cover: '', platforms: [] };
        const caught = await getChecksWithPrefix(`${CAUGHT_PREFIX}${s.trainerId}::`);
        const n = Object.values(caught).filter(Boolean).length;
        const pct = meta.total ? Math.round((n / meta.total) * 100) : 0;
        const href = withBase(`hobbies/pokemon/saves/${s.game}/?save=${s.trainerId}`);
        return `
          <a class="save-card" href="${href}">
            <img class="save-cover" src="${withBase(meta.cover)}" alt="" width="400" height="400" loading="lazy" decoding="async" />
            <div class="save-card-info">
              <strong>${escapeHtml(s.trainerName || '(sem nome)')}</strong>
              <span class="hint">${escapeHtml(meta.name)}${s.platform ? ` · ${escapeHtml(s.platform)}` : ''}</span>
              <span class="trainer-id">@${escapeHtml(s.trainerId)}</span>
            </div>
            ${s.movedToHome ? '<span class="home-icon" title="Movido pro HOME" aria-label="Movido pro HOME"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>' : ''}
            ${s.completed ? '<span class="completed-icon" title="Completado" aria-label="Completado"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v4M4 9h16M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><polyline points="9 12 12 15 16 11"/></svg></span>' : ''}
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
        const meta = gameIndex[s.game] ?? { name: s.game, generation: '', total: 0, cover: '', platforms: [] };
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
                    return `
                    <li class="home-mon${isCaught ? ' caught' : ''}">
                      <img src="${withBase(spritePath(e.id))}" alt="" width="96" height="96" loading="lazy" decoding="async" />
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
                <span class="hint">${escapeHtml(meta.name)}${s.platform ? ` · ${escapeHtml(s.platform)}` : ''} · @${escapeHtml(s.trainerId)}</span>
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

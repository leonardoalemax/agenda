// Sync entre dispositivos usando um Gist privado do GitHub como armazenamento.
//
// Modelo: "o mais novo vence". O gist guarda um snapshot inteiro do estado
// (checks + notas + preços) com um carimbo de tempo. Quem gravou por último
// ganha o arquivo todo — não há merge por chave.
//
// O token nunca entra no build: você cola na tela de sync e ele fica no
// IndexedDB deste aparelho. A API do GitHub aceita chamada direta do navegador
// (tem CORS liberado), então não existe servidor no meio.
import {
  exportAll,
  applySnapshot,
  getMeta,
  setMeta,
  localUpdatedAt,
  LOCAL_CHANGE_EVENT,
  type BackupData,
} from './store';

const API = 'https://api.github.com';
const FILENAME = 'minha-agenda.json';
const DESCRIPTION = 'Minha Agenda — estado sincronizado (não editar à mão)';
const POLL_MS = 30_000;
const DEBOUNCE_MS = 1_500;

export const SYNC_STATUS_EVENT = 'agenda:sync-status';

export type SyncState = 'off' | 'syncing' | 'ok' | 'error';
export interface SyncStatus {
  state: SyncState;
  message: string;
  at?: number;
}

let status: SyncStatus = { state: 'off', message: 'não configurado' };

function setStatus(state: SyncState, message: string) {
  status = { state, message, at: Date.now() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, { detail: status }));
  }
}

export function currentStatus(): SyncStatus {
  return status;
}

// ===== token =====

export async function getToken(): Promise<string> {
  return (await getMeta<string>('gh-token')) ?? '';
}

export async function clearToken(): Promise<void> {
  await setMeta('gh-token', '');
  await setMeta('gist-id', '');
  setStatus('off', 'não configurado');
}

/** Valida o token contra a API antes de guardar. Retorna erro legível ou null. */
export async function saveToken(token: string): Promise<string | null> {
  const clean = token.trim();
  if (!clean) return 'cole o token';

  const res = await fetch(`${API}/gists?per_page=1`, { headers: headers(clean) });
  if (res.status === 401) return 'token inválido ou revogado';
  if (res.status === 403) return 'token sem permissão de gist';
  if (!res.ok) return `GitHub respondeu ${res.status}`;

  await setMeta('gh-token', clean);
  await setMeta('gist-id', '');
  return null;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// ===== gist =====

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

/** Acha o gist do app pelo nome do arquivo; cria um privado se não existir. */
async function findOrCreateGist(token: string): Promise<string> {
  const known = await getMeta<string>('gist-id');
  if (known) return known;

  const res = await fetch(`${API}/gists?per_page=100`, { headers: headers(token) });
  if (!res.ok) throw new Error(`listar gists falhou (${res.status})`);

  const list = (await res.json()) as Array<{ id: string; files: Record<string, unknown> }>;
  const found = list.find((g) => g.files && FILENAME in g.files);
  if (found) {
    await setMeta('gist-id', found.id);
    return found.id;
  }

  const snapshot = await exportAll();
  const create = await fetch(`${API}/gists`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: DESCRIPTION,
      public: false,
      files: { [FILENAME]: { content: JSON.stringify(snapshot, null, 2) } },
    }),
  });
  if (!create.ok) throw new Error(`criar gist falhou (${create.status})`);

  const gist = (await create.json()) as { id: string };
  await setMeta('gist-id', gist.id);
  return gist.id;
}

async function readGist(token: string, id: string): Promise<BackupData | null> {
  const res = await fetch(`${API}/gists/${id}`, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) {
    // gist apagado no GitHub: esquece o id e recria no próximo ciclo
    await setMeta('gist-id', '');
    return null;
  }
  if (!res.ok) throw new Error(`ler gist falhou (${res.status})`);

  const gist = (await res.json()) as { files: Record<string, GistFile> };
  const file = gist.files?.[FILENAME];
  if (!file) return null;

  // arquivos grandes vêm truncados; nesse caso o conteúdo está no raw_url
  const raw = file.truncated && file.raw_url ? await (await fetch(file.raw_url)).text() : file.content;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as BackupData;
  } catch {
    throw new Error('conteúdo do gist não é JSON válido');
  }
}

async function writeGist(token: string, id: string, data: BackupData): Promise<void> {
  const res = await fetch(`${API}/gists/${id}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [FILENAME]: { content: JSON.stringify(data, null, 2) } } }),
  });
  if (!res.ok) throw new Error(`gravar gist falhou (${res.status})`);
}

// ===== ciclo =====

let running = false;

/** Compara os carimbos e deixa o mais novo vencer, nos dois sentidos. */
export async function syncNow(): Promise<void> {
  const token = await getToken();
  if (!token) {
    setStatus('off', 'não configurado');
    return;
  }
  if (!navigator.onLine) {
    setStatus('off', 'offline — sincroniza ao voltar a rede');
    return;
  }
  if (running) return;

  running = true;
  setStatus('syncing', 'sincronizando…');
  try {
    const id = await findOrCreateGist(token);
    const remote = await readGist(token, id);
    const remoteAt = remote?.updatedAt ?? 0;
    const localAt = await localUpdatedAt();

    if (remoteAt > localAt) {
      await applySnapshot(remote!, remoteAt);
      setStatus('ok', 'atualizado deste aparelho ← nuvem');
    } else if (localAt > remoteAt) {
      await writeGist(token, id, await exportAll());
      setStatus('ok', 'enviado deste aparelho → nuvem');
    } else {
      setStatus('ok', 'em dia');
    }
    await setMeta('last-sync', Date.now());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync]', msg);
    setStatus('error', msg);
  } finally {
    running = false;
  }
}

export async function initGistSync(): Promise<void> {
  if (typeof window === 'undefined') return;

  const token = await getToken();
  if (!token) {
    setStatus('off', 'não configurado');
    return;
  }

  syncNow();

  // edição local: espera parar de digitar antes de subir
  let timer: number | undefined;
  window.addEventListener(LOCAL_CHANGE_EVENT, () => {
    clearTimeout(timer);
    timer = window.setTimeout(syncNow, DEBOUNCE_MS);
  });

  // voltar pro app (trocar de aba, reabrir o PWA) é a hora mais provável
  // de existir mudança do outro aparelho
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });

  window.addEventListener('online', syncNow);
  setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') syncNow();
  }, POLL_MS);
}

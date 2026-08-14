// Persistência local no cliente (IndexedDB via idb).
// Guarda: estado dos checks, anotações, valores numéricos (ex.: preço pago),
// saves de Pokémon e metadados de sync (token do GitHub, id do gist, relógio
// da última edição).
//
// O IndexedDB é a fonte de verdade da tela — o app funciona offline sempre.
// O sync (src/lib/gist-sync.ts) só empurra/puxa o snapshot inteiro por cima.
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'minha-agenda';
const DB_VERSION = 6;

export const LOCAL_CHANGE_EVENT = 'agenda:local-change';
export const REMOTE_SYNC_EVENT = 'agenda:remote-sync';

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponível (SSR?)'));
  }
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      // Uma aba com conexão antiga travaria a abertura em qualquer outra aba
      // até fechar sozinha — sem esses dois handlers, isso trava em silêncio
      // (a Promise de db() nunca resolve, nada explica por quê). Fecha a
      // conexão velha assim que outra pede uma versão maior.
      blocking() {
        dbp?.then((d) => d.close());
        dbp = null;
      },
      blocked() {
        console.warn('[store] abertura do banco bloqueada por outra aba com versão antiga');
      },
      async upgrade(database, oldVersion, _newVersion, transaction) {
        if (!database.objectStoreNames.contains('checks')) database.createObjectStore('checks');
        if (!database.objectStoreNames.contains('notes')) database.createObjectStore('notes');
        // v2: valores numéricos (ex.: preço pago em R$)
        if (!database.objectStoreNames.contains('prices')) database.createObjectStore('prices');
        // v4: metadados de sync. (v3 tinha uma store 'pending' que não é mais
        // usada — snapshot inteiro dispensa fila por chave.)
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
        if (database.objectStoreNames.contains('pending')) database.deleteObjectStore('pending');

        // v5: saves de Pokémon (treinador + jogo, N por jogo).
        // v6: mudou a chave de 'id' genérico pra 'trainerId' específico.
        if (!database.objectStoreNames.contains('pokemonSaves')) {
          const store = database.createObjectStore('pokemonSaves', { keyPath: 'trainerId' });
          store.createIndex('game', 'game');
        } else if (oldVersion < 6) {
          // v5 → v6: recreia a store com nova chave
          database.deleteObjectStore('pokemonSaves');
          const store = database.createObjectStore('pokemonSaves', { keyPath: 'trainerId' });
          store.createIndex('game', 'game');
        }

        // v5 também reestruturou o hobby Pokémon: posse deixou de ser por
        // "cópia" (jogo+plataforma+mídia) e virou por jogo (físico/digital);
        // pokedex deixou de ser por cópia e virou por save. As chaves antigas
        // (pokemon-owned::, pokemon-caught::) usam outro formato de id e não
        // têm como migrar sozinhas — descarta em vez de deixar lixo órfão.
        if (oldVersion > 0 && oldVersion < 5) {
          let cursor = await transaction.objectStore('checks').openCursor();
          while (cursor) {
            if (String(cursor.key).startsWith('pokemon-')) await cursor.delete();
            cursor = await cursor.continue();
          }
        }
      },
    });
  }
  return dbp;
}

function emit(name: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name));
}

// ===== metadados =====

export async function getMeta<T = string>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

/** Marca "editei agora" — é este carimbo que decide quem é o mais novo. */
async function touch(): Promise<void> {
  await setMeta('updated-at', Date.now());
  emit(LOCAL_CHANGE_EVENT);
}

export async function localUpdatedAt(): Promise<number> {
  return (await getMeta<number>('updated-at')) ?? 0;
}

// ===== dados =====

export async function getCheck(key: string): Promise<boolean | undefined> {
  return (await db()).get('checks', key);
}

export async function setCheck(key: string, value: boolean): Promise<void> {
  await (await db()).put('checks', value, key);
  await touch();
}

/**
 * Todos os checks cujo nome começa com `prefix`, em uma varredura só.
 * Usado pelo Pokémon: contar centenas de pokémon de um save sem ler o banco
 * inteiro nem disparar uma leitura por checkbox.
 */
export async function getChecksWithPrefix(prefix: string): Promise<Record<string, boolean>> {
  const d = await db();
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const out: Record<string, boolean> = {};
  let cursor = await d.transaction('checks').store.openCursor(range);
  while (cursor) {
    out[String(cursor.key)] = cursor.value as boolean;
    cursor = await cursor.continue();
  }
  return out;
}

/**
 * Marca/desmarca várias chaves numa transação só. Usado pelo "marcar todos" /
 * "desmarcar todos" da pokedex — uma dex grande (Colosseum/XD) tem 1025
 * pokémon, e isso seria 1025 transações separadas se fosse setCheck em loop.
 */
export async function setChecksBulk(keys: string[], value: boolean): Promise<void> {
  const d = await db();
  const tx = d.transaction('checks', 'readwrite');
  await Promise.all([...keys.map((k) => tx.store.put(value, k)), tx.done]);
  await touch();
}

/** Apaga várias chaves numa transação só. */
async function deleteKeysBulk(store: 'checks', keys: string[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}

export async function getNote(key: string): Promise<string | undefined> {
  return (await db()).get('notes', key);
}

export async function setNote(key: string, value: string): Promise<void> {
  await (await db()).put('notes', value, key);
  await touch();
}

export async function getPrice(key: string): Promise<number | undefined> {
  return (await db()).get('prices', key);
}

export async function setPrice(key: string, value: number): Promise<void> {
  await (await db()).put('prices', value, key);
  await touch();
}

export async function deletePrice(key: string): Promise<void> {
  await (await db()).delete('prices', key);
  await touch();
}

// ===== saves de Pokémon =====

export interface PokemonSave {
  trainerId: string;
  game: string;
  trainerName?: string;
  /** Plataforma em que este save roda (ex.: "Nintendo Switch"). */
  platform?: string;
  /** Se os pokémon deste save já foram transferidos pro Pokémon HOME. */
  movedToHome?: boolean;
  /** Se este save já foi completado (100% pokédex). */
  completed?: boolean;
  createdAt: number;
}

/** Saves de um jogo, ou todos se `game` for omitido. */
export async function listSaves(game?: string): Promise<PokemonSave[]> {
  const d = await db();
  if (game) return d.getAllFromIndex('pokemonSaves', 'game', game);
  return d.getAll('pokemonSaves');
}

export async function getSave(trainerId: string): Promise<PokemonSave | undefined> {
  return (await db()).get('pokemonSaves', trainerId);
}

export async function createSave(
  game: string,
  trainerName?: string,
  trainerId?: string,
  platform?: string,
): Promise<PokemonSave> {
  const save: PokemonSave = {
    trainerId: trainerId || crypto.randomUUID(),
    game,
    trainerName,
    platform,
    createdAt: Date.now(),
  };
  await (await db()).put('pokemonSaves', save);
  await touch();
  return save;
}

export async function renameSave(trainerId: string, trainerName?: string, platform?: string): Promise<void> {
  const d = await db();
  const save = await d.get('pokemonSaves', trainerId);
  if (!save) return;
  await d.put('pokemonSaves', { ...save, trainerName, platform });
  await touch();
}

export async function setSaveMovedToHome(trainerId: string, movedToHome: boolean): Promise<void> {
  const d = await db();
  const save = await d.get('pokemonSaves', trainerId);
  if (!save) return;
  await d.put('pokemonSaves', { ...save, movedToHome });
  await touch();
}

export async function setSaveCompleted(trainerId: string, completed: boolean): Promise<void> {
  const d = await db();
  const save = await d.get('pokemonSaves', trainerId);
  if (!save) return;
  await d.put('pokemonSaves', { ...save, completed });
  await touch();
}

export async function updateTrainerId(oldTrainerId: string, newTrainerId: string): Promise<void> {
  const d = await db();
  const save = await d.get('pokemonSaves', oldTrainerId);
  if (!save) return;

  // Criar novo save com ID atualizado
  const updatedSave: PokemonSave = { ...save, trainerId: newTrainerId };

  // Atualizar pokémon capturados
  const caught = await getChecksWithPrefix(`pokemon-caught::${oldTrainerId}::`);
  await deleteKeysBulk('checks', Object.keys(caught));

  // Renomear chaves de pokémon capturados
  const d2 = await db();
  const tx = d2.transaction('checks', 'readwrite');
  for (const [key, val] of Object.entries(caught)) {
    const newKey = key.replace(`pokemon-caught::${oldTrainerId}::`, `pokemon-caught::${newTrainerId}::`);
    await tx.store.put(val, newKey);
  }
  await tx.done;

  // Deletar save antigo e inserir novo
  await d.delete('pokemonSaves', oldTrainerId);
  await d.put('pokemonSaves', updatedSave);
  await touch();
}

/** Apaga o save e, junto, todos os pokémon marcados dele (limpeza, não deixa órfão). */
export async function deleteSave(trainerId: string): Promise<void> {
  const caught = await getChecksWithPrefix(`pokemon-caught::${trainerId}::`);
  await deleteKeysBulk('checks', Object.keys(caught));
  await (await db()).delete('pokemonSaves', trainerId);
  await touch();
}

// ===== snapshot (backup em arquivo e sync) =====

export interface BackupData {
  app: 'minha-agenda';
  version: number;
  exportedAt: string;
  updatedAt?: number;
  checks: Record<string, boolean>;
  notes: Record<string, string>;
  prices: Record<string, number>;
  pokemonSaves?: PokemonSave[];
}

export async function exportAll(): Promise<BackupData> {
  const d = await db();
  const checks: Record<string, boolean> = {};
  const notes: Record<string, string> = {};
  const prices: Record<string, number> = {};
  for (const key of await d.getAllKeys('checks')) {
    checks[String(key)] = (await d.get('checks', key)) as boolean;
  }
  for (const key of await d.getAllKeys('notes')) {
    notes[String(key)] = (await d.get('notes', key)) as string;
  }
  for (const key of await d.getAllKeys('prices')) {
    prices[String(key)] = (await d.get('prices', key)) as number;
  }
  const pokemonSaves = await d.getAll('pokemonSaves');
  return {
    app: 'minha-agenda',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    updatedAt: await localUpdatedAt(),
    checks,
    notes,
    prices,
    pokemonSaves,
  };
}

/** Mescla por cima do que existe. Usado pelo import manual de arquivo. */
export async function importAll(data: Partial<BackupData>): Promise<void> {
  const d = await db();
  if (data.checks) for (const [k, v] of Object.entries(data.checks)) await d.put('checks', v, k);
  if (data.notes) for (const [k, v] of Object.entries(data.notes)) await d.put('notes', v, k);
  if (data.prices) for (const [k, v] of Object.entries(data.prices)) await d.put('prices', v, k);
  if (data.pokemonSaves) for (const s of data.pokemonSaves) await d.put('pokemonSaves', s);
  await touch();
}

/**
 * Substitui o estado local inteiro pelo snapshot remoto ("o mais novo vence").
 * Troca tudo em vez de mesclar para que apagar algo num aparelho também
 * apague no outro. Não marca edição local — o carimbo passa a ser o do remoto.
 */
export async function applySnapshot(data: Partial<BackupData>, remoteUpdatedAt: number): Promise<void> {
  const d = await db();
  await d.clear('checks');
  await d.clear('notes');
  await d.clear('prices');
  await d.clear('pokemonSaves');
  if (data.checks) for (const [k, v] of Object.entries(data.checks)) await d.put('checks', v, k);
  if (data.notes) for (const [k, v] of Object.entries(data.notes)) await d.put('notes', v, k);
  if (data.prices) for (const [k, v] of Object.entries(data.prices)) await d.put('prices', v, k);
  if (data.pokemonSaves) for (const s of data.pokemonSaves) await d.put('pokemonSaves', s);
  await setMeta('updated-at', remoteUpdatedAt);
  emit(REMOTE_SYNC_EVENT);
}

export async function clearAll(): Promise<void> {
  const d = await db();
  await d.clear('checks');
  await d.clear('notes');
  await d.clear('prices');
  await d.clear('pokemonSaves');
  await touch();
}

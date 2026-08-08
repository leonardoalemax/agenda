// Persistência local no cliente (IndexedDB via idb).
// Guarda: estado dos checks, anotações e valores numéricos (ex.: preço pago).
// Tudo fica no dispositivo. Backup manual via export/import JSON.
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'minha-agenda';
const DB_VERSION = 2;

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponível (SSR?)'));
  }
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('checks')) database.createObjectStore('checks');
        if (!database.objectStoreNames.contains('notes')) database.createObjectStore('notes');
        // v2: valores numéricos (ex.: preço pago em R$)
        if (!database.objectStoreNames.contains('prices')) database.createObjectStore('prices');
      },
    });
  }
  return dbp;
}

export async function getCheck(key: string): Promise<boolean | undefined> {
  return (await db()).get('checks', key);
}

export async function setCheck(key: string, value: boolean): Promise<void> {
  await (await db()).put('checks', value, key);
}

export async function getNote(key: string): Promise<string | undefined> {
  return (await db()).get('notes', key);
}

export async function setNote(key: string, value: string): Promise<void> {
  await (await db()).put('notes', value, key);
}

export async function getPrice(key: string): Promise<number | undefined> {
  return (await db()).get('prices', key);
}

export async function setPrice(key: string, value: number): Promise<void> {
  await (await db()).put('prices', value, key);
}

export async function deletePrice(key: string): Promise<void> {
  await (await db()).delete('prices', key);
}

export interface BackupData {
  app: 'minha-agenda';
  version: number;
  exportedAt: string;
  checks: Record<string, boolean>;
  notes: Record<string, string>;
  prices: Record<string, number>;
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
  return { app: 'minha-agenda', version: DB_VERSION, exportedAt: new Date().toISOString(), checks, notes, prices };
}

export async function importAll(data: Partial<BackupData>): Promise<void> {
  const d = await db();
  if (data.checks) {
    for (const [k, v] of Object.entries(data.checks)) await d.put('checks', v, k);
  }
  if (data.notes) {
    for (const [k, v] of Object.entries(data.notes)) await d.put('notes', v, k);
  }
  if (data.prices) {
    for (const [k, v] of Object.entries(data.prices)) await d.put('prices', v, k);
  }
}

export async function clearAll(): Promise<void> {
  const d = await db();
  await d.clear('checks');
  await d.clear('notes');
  await d.clear('prices');
}

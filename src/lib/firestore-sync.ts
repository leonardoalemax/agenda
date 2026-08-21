// Sync entre dispositivos e visitantes usando o Firestore — substitui o
// antigo gist-sync.ts.
//
// Modelo (igual ao gist antigo, mesmo "o mais novo vence" — só troca de
// transporte): um documento só (`sync/snapshot`) guarda o snapshot inteiro
// do estado (checks + notas + preços + saves) com um carimbo de tempo. Quem
// gravou por último ganha o documento todo — não há merge por chave.
//
// A diferença real de comportamento: LEITURA é pública (qualquer visitante,
// logado ou não, recebe o snapshot em tempo real via onSnapshot — é assim
// que "todo mundo vê" funciona) e ESCRITA só acontece se `isAdmin` (checado
// aqui por UX, garantido de verdade pelo firestore.rules). Sem isso, o
// visitante ficaria olhando pro IndexedDB vazio do próprio aparelho.
//
// Limite do Firestore: um documento não passa de ~1MiB. Enquanto o uso for
// pessoal isso sobra de longe; se um dia o snapshot chegar perto disso
// (centenas de milhares de checks), separar em mais de um documento resolve.
import { doc, getDoc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import { firestoreDb } from './firebase';
import { currentAdminStatus, ADMIN_STATUS_EVENT, type AdminStatus } from './auth-client';
import { exportAll, applySnapshot, localUpdatedAt, LOCAL_CHANGE_EVENT, type BackupData } from './store';

const DEBOUNCE_MS = 1_500;

export const SYNC_STATUS_EVENT = 'agenda:sync-status';

export type SyncState = 'connecting' | 'read-only' | 'syncing' | 'ok' | 'error';
export interface SyncStatus {
  state: SyncState;
  message: string;
  at?: number;
}

let status: SyncStatus = { state: 'connecting', message: 'conectando…' };

function setStatus(state: SyncState, message: string) {
  status = { state, message, at: Date.now() };
  window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, { detail: status }));
}

export function currentSyncStatus(): SyncStatus {
  return status;
}

function snapshotDoc() {
  return doc(firestoreDb(), 'sync', 'snapshot');
}

let pushing = false;

async function pushLocal(): Promise<void> {
  if (!currentAdminStatus().isAdmin || pushing) return;
  pushing = true;
  setStatus('syncing', 'enviando…');
  try {
    const data = await exportAll();
    await setDoc(snapshotDoc(), data as unknown as DocumentData);
    setStatus('ok', 'enviado → nuvem');
  } catch (err) {
    setStatus('error', err instanceof Error ? err.message : String(err));
  } finally {
    pushing = false;
  }
}

let pushTimer: number | undefined;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(pushLocal, DEBOUNCE_MS);
}

/** Compara os carimbos e deixa o mais novo vencer — só admin pode empurrar. */
async function reconcile(remote: BackupData | undefined): Promise<void> {
  const remoteAt = remote?.updatedAt ?? 0;
  const localAt = await localUpdatedAt();

  if (remoteAt > localAt) {
    await applySnapshot(remote!, remoteAt);
    setStatus('ok', currentAdminStatus().isAdmin ? 'atualizado ← nuvem' : 'em dia');
  } else if (currentAdminStatus().isAdmin && localAt > remoteAt) {
    await pushLocal();
  } else {
    setStatus('ok', 'em dia');
  }
}

let unsubscribeSnapshot: (() => void) | null = null;

export async function initFirestoreSync(): Promise<void> {
  if (typeof window === 'undefined') return;

  unsubscribeSnapshot?.();
  unsubscribeSnapshot = onSnapshot(
    snapshotDoc(),
    { includeMetadataChanges: true },
    (snap) => {
      // Eco da nossa própria escrita otimista — pushLocal() já cuida do status.
      if (snap.metadata.hasPendingWrites) return;

      if (!snap.exists()) {
        setStatus(currentAdminStatus().isAdmin ? 'ok' : 'read-only', 'sem dados publicados ainda');
        return;
      }
      reconcile(snap.data() as BackupData);
    },
    (err) => setStatus('error', err.message),
  );

  window.addEventListener(LOCAL_CHANGE_EVENT, schedulePush);

  // Login/logout muda quem pode escrever — reavalia na hora (bootstra o
  // primeiro push do admin quando a nuvem ainda não tem nada, ou só passa a
  // exibir "somente leitura" pra quem não é admin).
  window.addEventListener(ADMIN_STATUS_EVENT, async (e) => {
    const s = (e as CustomEvent<AdminStatus>).detail;
    if (!s.ready) return;
    if (!s.isAdmin) {
      setStatus('read-only', s.signedIn ? 'logado, mas não é a conta admin' : 'visitante — somente leitura');
      return;
    }
    const snap = await getDoc(snapshotDoc());
    await reconcile(snap.exists() ? (snap.data() as BackupData) : undefined);
  });
}

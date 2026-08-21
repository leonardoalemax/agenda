// Liga auth (Google/Firebase) + sync (Firestore) no cliente. Falha aqui
// nunca pode quebrar o app: mesmo sem rede, o IndexedDB local segue
// funcionando (diretriz 2: offline sempre).
//
// initAuth() resolve o estado de login primeiro — quem escuta
// agenda:admin-status (admin-gate.ts, firestore-sync.ts) depende de saber
// isso antes de decidir o que mostrar/travar.
import { applyAdminGate } from './admin-gate';
import { initAuth, ADMIN_STATUS_EVENT } from './auth-client';
import { initFirestoreSync } from './firestore-sync';

export async function initSync(): Promise<void> {
  if (typeof window === 'undefined') return;

  window.addEventListener(ADMIN_STATUS_EVENT, () => applyAdminGate(document));

  try {
    await initAuth();
    applyAdminGate(document);
    await initFirestoreSync();
  } catch (err) {
    console.error('[sync] erro ao iniciar:', err);
  }
}

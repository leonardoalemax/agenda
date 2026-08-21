// Login com Google via Firebase Auth. Só um e-mail (PUBLIC_ADMIN_EMAIL) é
// considerado admin — todo o resto (deslogado ou logado com outra conta) é
// visitante: lê tudo, não edita nada.
//
// A segurança de verdade é feita pelo Firestore (firestore.rules) — o que
// isto aqui decide é só a UI: mostrar/esconder controles de edição. Ver
// src/lib/admin-gate.ts.
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { firebaseAuth, googleProvider, ADMIN_EMAIL } from './firebase';

export const ADMIN_STATUS_EVENT = 'agenda:admin-status';

export interface AdminStatus {
  /** true assim que o Firebase confirmou (ou não) uma sessão salva. */
  ready: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  email: string | null;
  /** Foto da conta Google, pro avatar no header — null se não tiver ou deslogado. */
  photoURL: string | null;
}

let status: AdminStatus = { ready: false, signedIn: false, isAdmin: false, email: null, photoURL: null };

function computeIsAdmin(user: User | null): boolean {
  return Boolean(user && ADMIN_EMAIL && user.email === ADMIN_EMAIL && user.emailVerified);
}

function setStatus(user: User | null) {
  status = {
    ready: true,
    signedIn: Boolean(user),
    isAdmin: computeIsAdmin(user),
    email: user?.email ?? null,
    photoURL: user?.photoURL ?? null,
  };
  document.documentElement.dataset.admin = String(status.isAdmin);
  window.dispatchEvent(new CustomEvent<AdminStatus>(ADMIN_STATUS_EVENT, { detail: status }));
}

export function currentAdminStatus(): AdminStatus {
  return status;
}

let initPromise: Promise<void> | null = null;

/** Liga o listener de auth uma vez por página; resolve na 1ª confirmação de estado. */
export function initAuth(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!initPromise) {
    initPromise = new Promise((resolve) => {
      onAuthStateChanged(firebaseAuth(), (user) => {
        setStatus(user);
        resolve();
      });
    });
  }
  return initPromise;
}

/** Abre o popup de login do Google. Retorna mensagem de erro legível, ou null. */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    await signInWithPopup(firebaseAuth(), googleProvider());
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(firebaseAuth());
}

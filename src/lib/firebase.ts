// Inicializa o app do Firebase (Auth + Firestore) — só no navegador.
//
// As chaves PUBLIC_FIREBASE_* não são segredo: o SDK client-side do Firebase
// precisa delas em runtime, e quem decide quem pode escrever é o Firestore
// (firestore.rules), não essas chaves. Ver .env.example.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

/** E-mail do único usuário com permissão de escrita. Bate com firestore.rules. */
export const ADMIN_EMAIL = import.meta.env.PUBLIC_ADMIN_EMAIL ?? '';

function ensureApp(): FirebaseApp {
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
  }
  return app;
}

export function firebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

export function firestoreDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(ensureApp());
  return dbInstance;
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Sempre deixa escolher a conta — evita logar sozinho com a última usada
  // no aparelho quando não é a intenção.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

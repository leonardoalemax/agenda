// Liga o sync no cliente. Falha aqui nunca pode quebrar o app:
// sem token configurado, tudo continua funcionando em IndexedDB local.
export async function initSync(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const { initGistSync } = await import('./gist-sync');
    await initGistSync();
  } catch (err) {
    console.error('[sync] erro ao iniciar:', err);
  }
}

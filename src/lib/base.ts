// Junta o BASE_URL do site (ex.: "/minha-agenda/") com um caminho interno.
// Use em TODOS os links e assets internos para funcionar no GitHub Pages.
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL || '/';
  const clean = String(path).replace(/^\/+/, '');
  return (base.endsWith('/') ? base : base + '/') + clean;
}

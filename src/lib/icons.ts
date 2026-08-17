// Ícones vindos do pacote `lucide` (https://lucide.dev) — nunca copiados à
// mão. Só existe porque pokemon-client.ts monta HTML no cliente (fora do
// alcance do Astro, que já usa @lucide/astro direto nos .astro); em Astro,
// importe o componente de @lucide/astro em vez de mexer aqui.
import { X, House, MonitorCheck } from 'lucide';

type IconNode = [tag: string, attrs: Record<string, string | number>][];

const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

function renderIcon(node: IconNode): string {
  const inner = node
    .map(([tag, attrs]) => {
      const attrString = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${attrString}></${tag}>`;
    })
    .join('');
  return `<svg ${SVG_ATTRS}>${inner}</svg>`;
}

export const ICONS: Record<string, string> = {
  x: renderIcon(X),
  house: renderIcon(House),
  'monitor-check': renderIcon(MonitorCheck),
};

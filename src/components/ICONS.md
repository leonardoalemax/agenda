# Ícones (Lucide)

Ícone de UI é sempre do [Lucide](https://lucide.dev). Nunca emoji, nunca SVG
copiado à mão de outro lugar.

## Em páginas `.astro`

Use o pacote `@lucide/astro` direto — cada ícone é um componente Astro
próprio, importado pelo nome:

```astro
---
import { Search, Trash2 } from '@lucide/astro';
---

<Search size={20} />
<Trash2 size={18} class="text-muted" />
```

Não existe um componente `<Icon name="..." />` genérico neste projeto — é
`@lucide/astro` puro, sem wrapper. O nome do ícone em [lucide.dev](https://lucide.dev/icons)
(kebab-case, ex.: `trash-2`) vira PascalCase no import (`Trash2`).

Como o ícone entra via um componente filho (não o template da própria
página), CSS que precise mirar o `<svg>` renderizado tem que usar
`:global()`, ex.: `.minha-area :global(svg) { color: var(--muted); }`.

## No cliente (`pokemon-client.ts`)

`pokemon-client.ts` monta HTML por `innerHTML`/template string — fora do
alcance do Astro, `@lucide/astro` não serve aí. Pra isso existe
`src/lib/icons.ts`, que importa os mesmos ícones do pacote `lucide` (a base,
sem o wrapper Astro) e serializa pra string. Só tem os poucos ícones que o
client realmente injeta (hoje: `x`, `house`, `monitor-check`) — não duplique
a lista de `@lucide/astro` aqui, adicione só o que for usado nesse arquivo.

```ts
import { ICONS } from './icons';
el.innerHTML = `<span class="icon">${ICONS.x}</span>`;
```

Pra adicionar um ícone novo aí: importe o export do pacote `lucide` (mesmo
nome PascalCase de `@lucide/astro`) e registre no mapa `ICONS`.

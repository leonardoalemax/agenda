# Icon Component (Lucide Icons)

Componente reutilizável para renderizar ícones do [Lucide Icons](https://lucide.dev).

## Uso

```astro
---
import Icon from './Icon.astro';
---

<Icon name="search" size={20} />
<Icon name="chevron-down" />
<Icon name="plus" class="custom-class" />
```

## Props

- `name` (string): Nome do ícone em kebab-case (ex: `search`, `chevron-down`, `plus`)
- `size` (number, opcional): Tamanho em pixels. Padrão: `24`
- `class` (string, opcional): Classes CSS adicionais

## Ícones Disponíveis

Atualmente suportados:
- `search` — Ícone de busca (lupa)
- `chevron-down` — Seta para baixo
- `plus` — Sinal de mais
- `x` — Sinal de fechar (X)

### Adicionar Novos Ícones

1. Vá em [lucide.dev](https://lucide.dev) e encontre o ícone desejado
2. Copie o SVG do ícone
3. Adicione à lista `icons` no arquivo `Icon.astro` com o nome em kebab-case

Exemplo:
```astro
const icons: Record<string, string> = {
  // ... ícones existentes ...
  'star': `<svg xmlns="..." /* copie o SVG daqui */</svg>`,
};
```

## Estilo

O ícone herda `currentColor`, então responde à cor do texto. Use CSS normalmente:

```astro
<Icon name="search" class="text-blue-500" />
```

```css
.text-blue-500 { color: #3b82f6; }
```

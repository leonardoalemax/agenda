# Diretriz: Arquitetura

> Fonte da verdade sobre stack, build e deploy. Mudou aqui → ajuste o projeto.

## Stack (obrigatório)

- **Astro** (SSG, saída 100% estática). Não substituir por outro framework.
- **`@vite-pwa/astro`** para PWA (service worker, manifest, precache offline).
- **`idb`** para acesso ao IndexedDB no cliente.
- **TypeScript** em `strict` (`tsconfig.json` estende `astro/tsconfigs/strict`).

## Estrutura

```
src/
  content/            conteúdo em .md (fonte da verdade do conteúdo)
    hobbies/gunpla/   coleções de hobbies têm schema próprio
  content.config.ts   coleções + schema (Zod) por área
  layouts/            um layout por type (Diary, Checklist, Custom, ...)
  pages/              index + [...slug] (agenda) + rotas por área
  components/         UI reutilizável (Backup, etc.)
  lib/                store (IndexedDB), base (links), helpers de domínio
  styles/global.css   estilos globais (tema claro/escuro)
public/               assets estáticos + imagens (offline) + ícones PWA
scripts/              scripts one-off (gen-icons, importadores)
```

## Roteamento e `base`

- O site roda sob um **`base`** (ex.: `/minha-agenda/`) definido em
  `astro.config.mjs`. **Todo link/asset interno usa `withBase()`**
  (`src/lib/base.ts`) — nunca hardcode `/...`.
- Links canônicos **sem barra final** (ex.: `hobbies/gunpla`), pois é o que bate
  no precache do service worker offline.

## PWA / offline

- Configuração em `astro.config.mjs` → integração `AstroPWA`.
- **É MPA** (cada página tem seu HTML). Não usar `navigateFallback` apontando pro
  index de forma que quebre rotas.
- Qualquer tipo de asset que deva funcionar offline precisa estar no
  `workbox.globPatterns` (hoje inclui imagens `jpg/png/webp/...`).

## Build & Deploy

- Local: `npm install && npm run icons && npm run dev`.
- Produção: `npm run build` (gera `dist/` + `sw.js` + `manifest.webmanifest`).
- Deploy: **GitHub Pages** via `.github/workflows/deploy.yml` (push na `main`).
- Antes de publicar: ajustar `SITE` e `BASE` em `astro.config.mjs`.
- Assets baixados localmente (ex.: imagens de gunpla) **têm que ir no commit** —
  o CI não os rebaixa.

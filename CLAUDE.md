# Minha Agenda — Diretrizes do projeto

> **Estas diretrizes são a fonte da verdade.** Se algo aqui (ou em
> `docs/diretrizes/`) mudar, o código do projeto **deve ser ajustado** pra bater
> com a diretriz — e vice-versa: nenhuma mudança estrutural entra sem estar
> refletida aqui.

## Regras inegociáveis (acertadas)

1. **Sempre Astro.** O projeto é um app **Astro** estático (SSG). Nada de trocar
   por outro framework nem de "fazer do zero". Conteúdo via **content
   collections**, layout por `type` no frontmatter, roteamento com os arquivos
   em `src/pages/`. Build: `astro build`. Hospedagem: **GitHub Pages**.

2. **PWA offline sempre.** Instalável e funcional offline via
   **`@vite-pwa/astro`** (service worker + precache). Todo asset que precisa
   funcionar offline (inclusive imagens) tem que entrar no `globPatterns` do
   Workbox em `astro.config.mjs`.

3. **Dados em IndexedDB local; sync opcional por Gist.** Todo estado que o
   usuário altera (checks, preços pagos, notas) é salvo **localmente em
   IndexedDB** via `src/lib/store.ts` — **offline funciona 100%, sempre**.
   Havendo token configurado, `src/lib/gist-sync.ts` espelha o snapshot inteiro
   num **gist privado do GitHub**, com regra **"o mais novo vence"** (sem merge
   por chave). **Sem backend próprio.** O token é colado pelo usuário no app e
   fica no aparelho — **nunca no build, nunca no repositório**. Não introduzir
   servidor/DB remoto sem antes mudar esta diretriz.

## Onde estão os detalhes

- [`docs/diretrizes/arquitetura.md`](docs/diretrizes/arquitetura.md) — stack, build, deploy, PWA.
- [`docs/diretrizes/dados-e-sync.md`](docs/diretrizes/dados-e-sync.md) — IndexedDB, sync por gist.
- [`docs/diretrizes/conteudo.md`](docs/diretrizes/conteudo.md) — como escrever md, tipos, coleções.
- [`docs/SYNC.md`](docs/SYNC.md) — como ligar o sync entre iPad e iPhone.

## Antes de mudar algo estrutural

- Mexeu em stack, PWA ou persistência? Atualize a diretriz correspondente **no
  mesmo commit**.
- Adicionou um novo `type` de conteúdo ou coleção? Documente em
  `docs/diretrizes/conteudo.md`.
- Sempre rode `npm run build` pra garantir que o site e o service worker geram
  sem erro antes de considerar a tarefa pronta.

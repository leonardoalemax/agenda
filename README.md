# Minha Agenda

Agenda pessoal em **Markdown** com layouts guiados por tipo (diário, checklist, custom),
hospedada estática no **GitHub Pages** e instalável como **PWA** com suporte **offline**.
O estado das checklists e anotações fica salvo **localmente** (IndexedDB), com backup por
export/import de JSON.

> 📐 **Diretrizes do projeto** (fonte da verdade): [`CLAUDE.md`](CLAUDE.md) e
> [`docs/diretrizes/`](docs/diretrizes). Regras acertadas: sempre Astro, PWA
> offline, e dados do cliente em IndexedDB local (sem backend). Mudou a diretriz
> → o código acompanha.

## Como funciona

Você escreve arquivos `.md` em `src/content/`. O `frontmatter` define o tipo e o layout:

```md
---
type: checklist        # diario | checklist | custom
title: Mudança de casa
date: 2026-08-07
tags: [casa]
summary: Linha opcional que aparece na home.
---

- [ ] Contratar transportadora
- [ ] Empacotar a cozinha
```

- **diario** — data em destaque, ideal pra journaling.
- **checklist** — `- [ ]` viram caixas clicáveis com barra de progresso; o estado é salvo no dispositivo.
- **custom** — Markdown livre.

## Rodar localmente

```bash
npm install
npm run icons   # gera os PNGs do PWA a partir de public/favicon.svg
npm run dev
```

Build de produção:

```bash
npm run build && npm run preview
```

## Publicar no GitHub Pages

1. Em `astro.config.mjs`, ajuste `SITE` e `BASE`:
   - `SITE = 'https://SEU_USUARIO.github.io'`
   - `BASE = '/NOME_DO_REPO/'` (mantenha as barras). Se o repo for `SEU_USUARIO.github.io` ou você usar domínio próprio, use `'/'`.
2. Crie o repositório no GitHub e dê push na branch `main`.
3. Em **Settings → Pages**, defina **Source: GitHub Actions**.
4. O workflow `.github/workflows/deploy.yml` builda e publica a cada push.

## Backup dos dados

Os checks e notas ficam só no navegador do dispositivo. Na home:

- **Exportar backup** baixa um `.json`.
- **Importar backup** restaura (útil para levar pra outro aparelho).

## Estrutura

```
src/
  content/        seus .md (diario/ checklists/ custom/)
  layouts/        um layout por tipo
  components/     Backup (export/import)
  lib/            store (IndexedDB), checklist (hidratação), base (links)
  pages/          index + [...slug]
public/           favicon + ícones do PWA
```

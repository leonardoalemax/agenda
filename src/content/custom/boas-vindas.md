---
type: custom
title: Como usar a Minha Agenda
date: 2026-08-07
tags: [ajuda, comece-aqui]
summary: Guia rápido de como escrever páginas e o que cada tipo faz.
---

Bem-vindo(a)! Esta agenda é feita de arquivos **Markdown**. Cada arquivo vira
uma página, e o campo `type` no topo decide o **layout**.

## Criando uma página

Crie um `.md` dentro de `src/content/` com um frontmatter assim:

```md
---
type: diario        # diario | checklist | custom
title: Meu título
date: 2026-08-07
tags: [exemplo]
summary: Uma linha opcional que aparece na home.
---

Seu conteúdo em Markdown aqui.
```

Depois é só **dar push** — o site rebuilda e publica sozinho no GitHub Pages.

## Os tipos

- **`diario`** — entrada datada, com a data em destaque. Bom pra journaling.
- **`checklist`** — listas `- [ ]` viram caixas clicáveis com progresso salvo.
- **`custom`** — Markdown livre pra qualquer coisa.

## Offline e dados

O app é um **PWA**: dá pra instalar e usar sem internet. O que você marca nas
checklists fica salvo **neste dispositivo**. Use **Exportar backup** na home pra
guardar um `.json` e **Importar** em outro aparelho.

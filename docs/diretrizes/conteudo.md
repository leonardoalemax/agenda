# Diretriz: Conteúdo

> Como escrever e estruturar o conteúdo. Fonte da verdade — mudou aqui → ajuste
> o projeto (schemas, layouts).

## Modelo

- Conteúdo é **Markdown com frontmatter**, em `src/content/`.
- O campo **`type`** (agenda) decide o **layout** que renderiza o md.
- Coleções e schema (Zod) ficam em `src/content.config.ts`. Todo campo novo de
  frontmatter precisa ser declarado no schema.

## Coleção `agenda`

Tipos suportados (cada um com layout dedicado em `src/layouts/`):

- **`diario`** — entrada datada, data em destaque.
- **`checklist`** — listas `- [ ]` viram caixas clicáveis (estado no IndexedDB),
  com barra de progresso.
- **`custom`** — Markdown livre.

Frontmatter comum: `title` (obrigatório), `type`, `date`, `tags`, `summary`.

## Áreas / hobbies

- `hobbies/` é **excluído** da coleção `agenda` e tem **coleções próprias** com
  schema específico. Ex.: **`gunpla`**.
- Ao criar uma nova área, criar: a coleção em `content.config.ts`, as rotas em
  `src/pages/<area>/...`, e documentar aqui.

### Gunpla (exemplo de área)

- Cada kit é um `.md` em `src/content/hobbies/gunpla/` (o **corpo** é o conteúdo
  futuro do kit; frontmatter tem `name`, `grade`, `scale`, `code`, `priceYen`,
  `image`, `tags`).
- A tag **`wishlist`** marca o que aparece na página de wishlist.
- **Imagens são locais** (`public/hobbies/gunpla/`) para funcionar offline —
  nunca depender de URL externa em runtime.
- **Cotação fixa** para exibir preço em R$: **1000 ¥ = R$ 35** (centralizada em
  `src/lib/gunpla.ts`; mudou a regra → muda só lá).
- Importação/atualização em massa: `scripts/gunpla-import.mjs`
  (`npm run gunpla:import`). Ele **não sobrescreve** `.md` já editados.

## Regras gerais

- Imagem que precisa de offline → baixar pra `public/` e referenciar com
  `withBase()`.
- Datas: formatar sempre com `timeZone: 'UTC'` pra não dar erro de fuso
  (frontmatter `date: YYYY-MM-DD` é meia-noite UTC).

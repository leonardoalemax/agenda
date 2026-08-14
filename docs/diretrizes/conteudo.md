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

- `hobbies/` é **excluído** da coleção `agenda`. Uma área pode ser:
  - **coleção de markdown**, quando cada item tem texto próprio (ex.: `gunpla`,
    onde o corpo do `.md` vira a página do kit); ou
  - **dados de referência em JSON**, quando o conteúdo é tabela e não prosa
    (ex.: `pokemon`). Aí não há coleção: o `.astro` importa o JSON direto e o
    Astro/Vite resolve em build.
- Ao criar uma nova área, criar as rotas em `src/pages/hobbies/<area>/...`, a
  coleção em `content.config.ts` **se for markdown**, e documentar aqui.

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

### Pokémon (área movida a dados)

- Dados em `src/content/hobbies/pokemon/data/*.json`, importados por
  `src/lib/pokemon.ts`. Não é content collection — é tabela, não texto.
- Três subáreas, com propósitos deliberadamente separados — **posse não
  interfere na pokedex**:
  - **`/hobbies/pokemon/`** ("Jogos") — só posse: por jogo, físico e/ou
    digital, sem plataforma. `mediaForGame()` soma as mídias de todas as
    plataformas do jogo (ex.: FireRed = GBA físico + Switch digital →
    `['physical', 'digital']`); a plataforma em si nunca aparece na tela.
  - **`/hobbies/pokemon/saves/`** — saves de verdade: treinador + jogo +
    plataforma, com pokedex própria. Um jogo pode ter N saves
    (`pokemonSaves` no `store.ts`, dado do usuário — não vem do JSON). A
    rota `saves/[game].astro` é **estática por jogo** (48 páginas via
    `getStaticPaths`, obrigatório porque saves são dado dinâmico do usuário —
    não dá pra gerar uma página estática por save). Cada visita a essa rota é
    **relativa a um único save**, escolhido só via `?save=<trainerId>` — a
    página não tem seletor/lista de saves nem escolhe "o mais recente" como
    fallback; sem `?save=` válido pra este jogo, mostra estado vazio com link
    de volta pra `/hobbies/pokemon/saves/`. Trocar de save ou criar um novo é
    responsabilidade exclusiva da listagem em `/hobbies/pokemon/saves/`
    (`initPokemonSavesOverview`), que já mostra todos os saves de todos os
    jogos — inclusive vários do mesmo jogo — com link direto pra
    `saves/<game>/?save=<id>`. Plataforma é escolhida no modal de
    criar/editar save, listando só as plataformas que aquele jogo teve de
    verdade (`platformsForGame()`, mesma fonte de `platforms-by-generation.json`
    que já alimentava `mediaForGame()`).
  - **`/hobbies/pokemon/home/`** — pokémon transferidos pro Pokémon HOME. A
    transferência é **por save inteiro**, não por pokémon: o checkbox
    "Movido pro HOME" (`PokemonSave.movedToHome` em `store.ts`) marca o save
    todo. A tela de HOME lista, pra cada save marcado, a caixa desse jogo com
    o que aquele save tem capturado — mesmo componente visual da página do
    save, só que sem clique (é resumo, editar é lá no save). Pra não embutir
    a dex dos 48 jogos numa página só, a dex de cada jogo vem de um endpoint
    estático (`dex-data/[game].json.ts`, uma rota `.json` por jogo via
    `getStaticPaths`) buscado sob demanda só pros jogos que têm save marcado
    — cai no precache do PWA como qualquer `.json`. Nunca importar
    `dexForGame`/`boxesFor`/`layoutForGame` (que arrastam `pokedexes.json`,
    506KB) direto em `pokemon-client.ts`; isso já quebrou o tree-shaking uma
    vez e inflou o bundle client-side à toa.
- `box-layout.json` decide a apresentação de cada jogo: `graphic-grid` (grade de
  caixa, ex. 6×5), `icon-list` (gen 1/2, lista de 20) e `infinite-list`
  (Let's Go, sem caixas). `cols` e `rows` (rows = perBox ÷ cols) valem em
  **qualquer largura de tela** — no mobile só a célula encolhe, o número de
  colunas nunca muda; isso já quebrou uma vez por uma media query forçando 3
  colunas fixas por cima do dado.
- Sprites são **locais** (`public/hobbies/pokemon/sprites/<id-nacional>.png`),
  baixados por `npm run pokemon:sprites`. O script pula o que já existe.
- Capas dos jogos também são **locais** (`public/hobbies/pokemon/covers/<slug>.webp`,
  400×400, uma por jogo), servidas por `coverPath()` em `pokemon.ts` e exibidas
  em `/hobbies/pokemon/`. Entram no precache do PWA pelo `globPatterns` de
  `astro.config.mjs` (já cobre `.webp`) — nenhum jogo pode faltar cover, senão
  quebra offline com 404 de imagem.
- `pokemon-encounters.json` e `pokemon-evolution-chains.json` **não são
  importados** por nenhuma página — ficam de reserva. Não importar sem
  necessidade: são 6,1MB e 832KB e entrariam no bundle.
- Criar/editar save usa um `<dialog>` nativo (`ensureSaveModal()` em
  `pokemon-client.ts`, CSS genérico `.pokemon-modal` em `global.css`) — sem
  `prompt()`. No desktop é um cartão centralizado; no mobile (`≤640px`) vira
  folha subindo do rodapé, mesmo elemento, só o CSS muda. Criar sem jogo fixo
  (`/saves/`) mostra primeiro a lista de jogos com capa pra escolher; criar
  com jogo fixo (`/saves/<game>/`) e editar pulam direto pro formulário
  (ID + nome do treinador).

## Regras gerais

- Imagem que precisa de offline → baixar pra `public/` e referenciar com
  `withBase()`.
- Datas: formatar sempre com `timeZone: 'UTC'` pra não dar erro de fuso
  (frontmatter `date: YYYY-MM-DD` é meia-noite UTC).

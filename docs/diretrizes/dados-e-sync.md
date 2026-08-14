# Diretriz: Dados e sincronização

> Como o app guarda o que o usuário altera. Fonte da verdade — mudou aqui →
> ajuste o projeto (e vice-versa).

## Princípio (acertado)

- **Local-first, sem backend próprio.** Todo estado editável fica em
  **IndexedDB**, no dispositivo. O app funciona **100% offline** — a rede nunca
  é pré-requisito pra ler ou escrever.
- **Sync opcional por Gist privado.** Quando há token configurado, o snapshot
  inteiro sobe pra um gist do GitHub. **Não existe servidor nosso**: o navegador
  fala direto com a API do GitHub.
- **"O mais novo vence."** Comparação por carimbo de tempo do snapshot inteiro,
  sem merge por chave. Editar em dois aparelhos ao mesmo tempo faz o último a
  gravar sobrescrever o outro — aceito de propósito, em troca de simplicidade.
- **Portabilidade continua manual também.** Exportar / Importar JSON
  (componente `Backup`) segue funcionando, independente do sync.
- **Dado de terceiro entra no build, nunca em runtime.** Quando a informação
  vem de uma API externa (ex.: RetroAchievements), ela é baixada por um script
  na máquina, commitada como JSON + imagens, e o site gerado só lê o arquivo.
  O navegador **não** fala com API de terceiro — nem para ter chave no bundle,
  nem para depender de rede. Ver "Sync de build" abaixo.

## Camada de acesso: `src/lib/store.ts`

Toda leitura/escrita de estado passa por aqui. Não acessar `indexedDB` direto em
componentes.

- Banco: `minha-agenda` (idb). Versão atual: **5**.
- Object stores:
  - **`checks`** — booleanos. Usado por checklists, "comprado" de gunpla,
    posse de jogo e pokémon capturado (Pokémon).
  - **`notes`** — strings. Anotações livres futuras.
  - **`prices`** — números. Valores em R$ (ex.: preço pago de um kit).
  - **`meta`** — metadados de sync: `gh-token`, `gist-id`, `updated-at`,
    `last-sync`. **Nunca entra no export/backup** (token é segredo do aparelho).
  - **`pokemonSaves`** (v5) — registros `{ id, game, trainerName, createdAt }`,
    `keyPath: 'id'`, índice `game`. Um save = uma jogada; um jogo pode ter N.
- API: `getCheck/setCheck`, `getNote/setNote`, `getPrice/setPrice/deletePrice`,
  `getChecksWithPrefix`, `setChecksBulk`, `listSaves/getSave/createSave/
  renameSave/deleteSave`, `exportAll/importAll/applySnapshot`, `clearAll`,
  `getMeta/setMeta`.
- Toda escrita local carimba `updated-at` e emite `agenda:local-change`. É esse
  carimbo que decide quem é "o mais novo" no sync.
- `applySnapshot()` **substitui** o estado (não mescla), pra que apagar algo num
  aparelho também apague no outro. Emite `agenda:remote-sync`.
- `deleteSave()` apaga o registro do save **e** todas as chaves
  `pokemon-caught::<saveId>::*` dele — limpeza em cascata, não deixa órfão.
- `db()` registra `blocking`/`blocked`: uma aba com conexão numa versão antiga
  do banco fecha sozinha quando outra pede uma versão maior. Sem isso, abrir o
  banco trava em silêncio (a Promise nunca resolve) sempre que duas abas do
  app ficam abertas ao mesmo tempo em versões diferentes — foi exatamente o
  que aconteceu ao introduzir a v5 com uma aba antiga ainda aberta.
- Ao adicionar um novo object store, **incremente `DB_VERSION`** e trate a
  criação no `upgrade`, inclua no `exportAll/importAll/clearAll`, e atualize esta
  lista.

## Convenção de chaves

Chave = `"<escopo>::<id-estável>"`, para não colidir entre páginas:

- **Checklist:** `"<slug-do-doc>::<hash-do-texto-do-item>"`
  (o hash do texto evita que reordenar itens perca o estado).
- **Gunpla comprado:** `"gunpla-bought::<slug-do-kit>"` (store `checks`).
- **Gunpla preço pago:** `"gunpla-paid::<slug-do-kit>"` (store `prices`, R$).
- **Pokémon posse do jogo:** `"pokemon-owned::<jogo>::<midia>"` (store
  `checks`, `midia` ∈ `physical | digital`). Sem plataforma — um FireRed
  comprado em GBA e resgatado no Switch é "tenho físico e digital", uma linha
  só, não duas.
- **Pokémon pego:** `"pokemon-caught::<saveId>::<especie>"` (store `checks`).
  `saveId` é o `id` do registro em `pokemonSaves` — cada save tem pokedex
  própria, então dois saves do mesmo jogo nunca compartilham progresso.
- Novos recursos seguem o mesmo padrão de prefixo por escopo.

Contar progresso lê por prefixo (`getChecksWithPrefix`), numa varredura só —
não uma leitura por checkbox (são ~17 mil pokémon somando todos os jogos).

## Preço pago vs projeção (gunpla)

- A **projeção inicial** de um kit é `priceYen` convertido a R$ pela cotação fixa.
- O **preço pago** (R$) fica no store `prices` e é editável só quando o kit está
  comprado. A **diferença** exibida = `pago − projeção` (negativo = abaixo/economia,
  positivo = acima). Há diferença por kit e agregada (só sobre os kits com preço
  pago informado).

## Sync por Gist: `src/lib/gist-sync.ts`

- Armazém: um **gist privado** com o arquivo `minha-agenda.json`. O app acha o
  gist pelo nome do arquivo e cria sozinho se não existir — não se copia id.
- **Token:** escopo `gist`, colado pelo usuário no painel `SyncPanel` e guardado
  em `meta`. **Nunca vai pro build nem pro repositório.**
- Gatilhos: ao abrir, ao voltar o foco na aba, ao voltar a rede, a cada 30s, e
  1,5s depois de parar de editar (debounce).
- Ciclo: lê o remoto → compara `updatedAt` → o maior vence (aplica localmente ou
  grava no gist). Estado exposto via evento `agenda:sync-status`.
- Sem token, tudo isso fica inerte e o app segue local.

## Hidratação no cliente

- A página renderiza o HTML (estado "vazio"); um `<script>` do layout chama o
  inicializador (ex.: `initChecklists()`, `initGunplaWishlist()`), que lê do
  IndexedDB e aplica o estado + listeners de `change` que persistem.
- Os inicializadores também escutam `agenda:remote-sync` e re-hidratam quando o
  sync traz dado de outro aparelho (sem sobrescrever campo em foco).
- Regra: **o Markdown/frontmatter é a fonte da verdade do conteúdo**; o
  IndexedDB é a fonte da verdade só do **estado de interação**.

## Backup (export/import)

- `exportAll()` gera `{ app, version, exportedAt, updatedAt, checks, notes, prices }`.
  É o mesmo formato que vai pro gist.
- `importAll()` faz merge por chave (não apaga o que não veio no arquivo) e
  carimba edição local — então um import manual também sobe no próximo sync.
- Formato versionado (`version`) para permitir migração futura.

## Sync de build (dado de terceiro): Cheevos / RetroAchievements

Segunda classe de dado do projeto, oposta ao IndexedDB: **read-only, vem de
fora, e é congelada no commit**. O IndexedDB guarda o que *você edita*; isto
guarda o que *outro sistema sabe*.

- **Script:** `scripts/cheevos-sync.mjs` (`npm run cheevos:sync`). Roda na sua
  máquina, sob demanda — **não** faz parte de `npm run build`.
- **Credenciais:** `RA_USERNAME` e `RA_API_KEY` num `.env` na raiz (ignorado
  pelo git; modelo em `.env.example`). Mesma regra do token do gist: **nunca no
  build, nunca no repositório**. Sem elas o script sai com erro explicando o que
  fazer — o build do site continua funcionando.
- **Escopo:** todos os jogos que o usuário já jogou
  (`API_GetUserCompletionProgress`), com as conquistas de cada um
  (`API_GetGameInfoAndUserProgress`).
- **Saída (tudo commitado):**
  - `src/content/hobbies/cheevos/data/index.json` — lista de jogos + totais.
  - `src/content/hobbies/cheevos/data/games/<id>.json` — conquistas do jogo.
  - `public/hobbies/cheevos/games/<icon>.png` — ícone do jogo.
  - `public/hobbies/cheevos/badges/<badge>[_lock].png` — badge de cada
    conquista, nos dois estados (colorida = feita, `_lock` = falta).
- **Por que as imagens vêm junto:** diretriz 2 (offline sempre). Servir badge da
  CDN do RetroAchievements quebraria a área inteira sem rede.
- **Incremental:** imagem já em disco não é rebaixada; JSON de jogo que saiu do
  escopo é apagado. Rodar de novo é barato e idempotente.
- **Leitura:** `src/lib/cheevos.ts`, sempre via `import.meta.glob` — antes do
  primeiro sync os arquivos não existem e um `import` direto quebraria o build.
  `getStaticPaths` devolve zero rotas nesse caso e a index mostra o passo a passo.

Ao adicionar outra fonte externa, siga o mesmo desenho: script → JSON + assets
commitados → `lib` que tolera ausência → página com estado vazio útil.

### Ponte Pokémon ↔ Cheevos

`scripts/pokemon-ra-map.mjs` (`npm run pokemon:ra-map`) relaciona cada jogo da
área Pokémon ao jogo equivalente no RetroAchievements. Roda sob demanda e o
resultado é commitado em
`src/content/hobbies/pokemon/data/retroachievements.json` (~6 KB).

- **Só precisa de `RA_API_KEY`** — lê o catálogo público de jogos, não o
  progresso de ninguém.
- **O console vem do projeto**, de `platforms-by-generation.json`; os ids vêm da
  API. A curadoria no script é só o *título esperado* de cada jogo.
- **Casamento é por título normalizado e exato.** O RetroAchievements tem
  centenas de romhacks (`~Hack~ Pokémon Brown`) e subsets
  (`… [Subset - Professor Oak Challenge]`) que um "contém" pegaria por engano.
- **Pagine sempre:** `API_GetGameList` devolve no máximo 500 por chamada mesmo
  com `c` maior. Sem paginar, HeartGold/SoulSilver sumiam por cair depois do
  corte alfabético.
- **Ausência é resultado, não erro.** O JSON tem `matched` e `unsupported`, e os
  48 jogos estão em um dos dois. Hoje: 22 relacionados; 23 fora (3DS e Switch não
  são emulados no RA) e 3 versões japonesas sem conquistas próprias.
- **Versão dupla:** HG/SS são uma entrada só lá (`… | …`), então os dois slugs
  apontam pro mesmo id — o conjunto de conquistas é compartilhado mesmo.
- Quando um título não casa, o script imprime os títulos parecidos daquele
  console, pra corrigir a lista `TITLES` sem caçar na mão.

Leitura: `retroGameFor(slug)` / `retroUnsupportedReason(slug)` em
`src/lib/pokemon.ts` (via `import.meta.glob`, tolerante ao arquivo não existir).

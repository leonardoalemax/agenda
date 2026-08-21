# Diretriz: Dados e sincronização

> Como o app guarda o que o usuário altera. Fonte da verdade — mudou aqui →
> ajuste o projeto (e vice-versa).

## Princípio (acertado)

- **Local-first.** Todo estado editável fica em **IndexedDB**, no dispositivo.
  O app funciona **100% offline** — a rede nunca é pré-requisito pra ler ou
  escrever no seu próprio aparelho.
- **Sync por Firestore, leitura pública, escrita só admin.** O snapshot
  inteiro vive num documento do **Firestore** (`sync/snapshot`) e é espelhado
  em tempo real (`onSnapshot`) pra **qualquer visitante**, logado ou não —
  é assim que o site funciona como página pública com os dados de um usuário
  só. **Escrever** só é aceito de quem loga via **Google (Firebase Auth)**
  com o e-mail que bate com `PUBLIC_ADMIN_EMAIL` — decidido de verdade pelo
  `firestore.rules`, nunca pelo client. Ver "Login e permissões" abaixo.
- **"O mais novo vence."** Comparação por carimbo de tempo do snapshot inteiro,
  sem merge por chave. Editar em dois aparelhos ao mesmo tempo (ambos como
  admin) faz o último a gravar sobrescrever o outro — aceito de propósito, em
  troca de simplicidade.
- **Backup manual (export/import) tirado da UI por enquanto** — sem tela pra
  isso hoje. `exportAll()`/`importAll()` continuam em `src/lib/store.ts` (o
  primeiro inclusive é usado pelo sync, pra montar o snapshot que vai pro
  Firestore); só não tem botão que chame `importAll()` no momento.
- **Dado de terceiro entra no build, nunca em runtime.** Quando a informação
  vem de uma API externa (ex.: RetroAchievements), ela é baixada por um script
  na máquina, commitada como Markdown + imagens, e o site gerado só lê o
  arquivo. O navegador **não** fala com API de terceiro — nem para ter chave
  no bundle, nem para depender de rede. Ver "Sync de build" abaixo.

## Camada de acesso: `src/lib/store.ts`

Toda leitura/escrita de estado passa por aqui. Não acessar `indexedDB` direto em
componentes.

- Banco: `minha-agenda` (idb). Versão atual: **6**.
- Object stores:
  - **`checks`** — booleanos. Usado por checklists, "comprado" de gunpla,
    posse de jogo e pokémon capturado (Pokémon).
  - **`notes`** — strings. Anotações livres futuras.
  - **`prices`** — números. Valores em R$ (ex.: preço pago de um kit).
  - **`meta`** — metadados de sync: `updated-at` (carimbo que decide quem é
    "o mais novo"). **Nunca entra no export/backup.** (Versões antigas do app
    guardavam `gh-token`/`gist-id` aqui, do sync por Gist — não são mais lidos
    nem escritos; sobram inofensivos em quem já tinha usado.)
  - **`pokemonSaves`** (v6) — registros `{ trainerId, game, trainerName,
    platform, movedToHome, completed, hoursSpent, createdAt }`,
    `keyPath: 'trainerId'`, índice `game`. Um save = uma jogada; um jogo pode
    ter N.
- API: `getCheck/setCheck`, `getNote/setNote`, `getPrice/setPrice/deletePrice`,
  `getChecksWithPrefix`, `setChecksBulk`, `listSaves/getSave/createSave/
  renameSave/updateTrainerId/setSaveMovedToHome/setSaveCompleted/deleteSave`,
  `exportAll/importAll/applySnapshot`, `clearAll`, `getMeta/setMeta`.
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

## Login e permissões: `src/lib/auth-client.ts` + `src/lib/admin-gate.ts`

- **Login:** só Google, via Firebase Auth (`signInWithPopup` + `GoogleAuthProvider`).
  Sem cadastro, sem senha própria.
- **Quem é admin:** `user.email === PUBLIC_ADMIN_EMAIL && user.emailVerified`.
  Só essa conta tem permissão de escrita — qualquer outra conta Google logada
  é tratada como visitante (lê tudo, edita nada), igual a deslogado.
- **A segurança de verdade é o `firestore.rules`** (raiz do repo, e-mail admin
  fixo na regra — Firestore Rules não leem `.env`, então não tem como ler
  `PUBLIC_ADMIN_EMAIL` de lá; os dois têm que bater à mão se um dia trocar de
  conta). Tudo no client (`auth-client.ts`, `admin-gate.ts`) é só UX: evita
  mostrar um botão que ia falhar.
- **`agenda:admin-status`** (evento em `window`) carrega `{ ready, signedIn,
  isAdmin, email }` e é o que todo o resto reage a — inclusive
  `document.documentElement.dataset.admin` (`"true"`/`"false"`), pra CSS que
  precisar.
- **Gate de controles:** todo controle que edita dado compartilhado nasce
  `disabled` no HTML (marcado `data-admin-only`) — visitante nunca vê, nem por
  um instante, um botão "ativo" que na verdade não faz nada.
  `applyAdminGate()` liga de volta só quando `isAdmin` é true. Ao adicionar um
  controle de escrita novo: marque `data-admin-only disabled` no template.
  Não precisa gate próprio pra conteúdo criado dentro de um modal/formulário
  cujo botão de abrir já é `data-admin-only` — quem não pode clicar em abrir
  nunca chega lá dentro.

## Sync por Firestore: `src/lib/firestore-sync.ts`

- Armazém: **um documento**, `sync/snapshot` no Firestore. Mesmo formato do
  `exportAll()`/`BackupData` de sempre — só troca o transporte.
- **Leitura:** `onSnapshot` em tempo real, pra **qualquer visitante** —
  `firestore.rules` libera `allow read: if true`. É o que faz o site mostrar
  os dados reais pra quem nunca logou.
- **Escrita:** só dispara se `isAdmin` (client) — e só é aceita se
  `firestore.rules` concordar (servidor). Gatilho: 1,5s depois de parar de
  editar (debounce), igual o sync antigo.
- Ciclo "o mais novo vence": ao receber um snapshot remoto, compara
  `updatedAt` com `localUpdatedAt()`; o maior vence (aplica localmente ou
  publica). Login como admin também dispara essa comparação — é assim que o
  primeiro snapshot do Firestore nasce (o admin loga num aparelho que já tem
  dado local, o local é mais novo que "nada no Firestore", publica sozinho).
- Estado exposto via evento `agenda:sync-status` (`connecting` / `read-only` /
  `syncing` / `ok` / `error`), lido pelo componente `AuthPanel`.
- **Limite do Firestore:** um documento não passa de ~1MiB. De longe suficiente
  pro uso pessoal de hoje; se um dia o snapshot chegar perto disso, separar em
  mais de um documento resolve (não é urgente).

## Hidratação no cliente

- A página renderiza o HTML (estado "vazio"); um `<script>` do layout chama o
  inicializador (ex.: `initChecklists()`, `initGunplaWishlist()`), que lê do
  IndexedDB e aplica o estado + listeners de `change` que persistem.
- Os inicializadores também escutam `agenda:remote-sync` e re-hidratam quando o
  sync traz dado de outro aparelho (sem sobrescrever campo em foco).
- Regra: **o Markdown/frontmatter é a fonte da verdade do conteúdo**; o
  IndexedDB é a fonte da verdade só do **estado de interação**.

## Backup (export/import) — funções prontas, sem UI hoje

- `exportAll()` gera `{ app, version, exportedAt, updatedAt, checks, notes, prices, pokemonSaves }`
  — é o mesmo formato que vai pro Firestore. Usado por `firestore-sync.ts`.
- `importAll()` faz merge por chave (não apaga o que não veio no arquivo) e
  carimba edição local — então um import manual também subiria no próximo
  sync. Sem tela que chame isso agora.
- Formato versionado (`version`) para permitir migração futura, se um dia
  voltar a ter UI de backup manual.

## Sync de build (dado de terceiro): Cheevos / RetroAchievements

Segunda classe de dado do projeto, oposta ao IndexedDB: **read-only, vem de
fora, e é congelada no commit**. O IndexedDB guarda o que *você edita*; isto
guarda o que *outro sistema sabe*.

- **Script:** `scripts/cheevos-sync.mjs` (`npm run cheevos:sync`). Roda na sua
  máquina, sob demanda — **não** faz parte de `npm run build`.
- **Credenciais:** `RA_USERNAME` e `RA_API_KEY` num `.env` na raiz (ignorado
  pelo git; modelo em `.env.example`). Mesma regra das chaves do Firebase e do
  token antigo do gist: **nunca no build, nunca no repositório** (exceto as
  `PUBLIC_FIREBASE_*`, que são feitas pra ir pro bundle). Sem elas o script sai
  com erro explicando o que fazer — o build do site continua funcionando.
- **Escopo:** todos os jogos que o usuário já jogou
  (`API_GetUserCompletionProgress`), com as conquistas de cada um
  (`API_GetGameInfoAndUserProgress`).
- **Saída (tudo commitado):**
  - `src/content/hobbies/cheevos/games/<id>.md` — jogo + conquistas, tudo num
    arquivo (content collection `cheevosGames`).
  - `src/content/hobbies/cheevos/sync.md` — metadado do último sync (usuário,
    quando; totais são somados de `cheevosGames` na leitura).
  - `public/hobbies/cheevos/games/<icon>.png` — ícone do jogo.
  - `public/hobbies/cheevos/badges/<badge>[_lock].png` — badge de cada
    conquista, nos dois estados (colorida = feita, `_lock` = falta).
- **Por que as imagens vêm junto:** diretriz 2 (offline sempre). Servir badge da
  CDN do RetroAchievements quebraria a área inteira sem rede.
- **Incremental:** imagem já em disco não é rebaixada; `.md` de jogo que saiu do
  escopo é apagado. Rodar de novo é barato e idempotente.
- **Leitura:** `src/lib/cheevos.ts`, via `getCollection('cheevosGames'|'cheevosSync')`
  (`astro:content` — só no servidor/build, nunca em código de cliente).

Ao adicionar outra fonte externa, siga o mesmo desenho: script → Markdown +
assets commitados → content collection → página com estado vazio útil se
ainda não rodou.

### Ponte Pokémon ↔ Cheevos

`scripts/pokemon-ra-map.mjs` (`npm run pokemon:ra-map`) relaciona cada jogo da
área Pokémon ao jogo equivalente no RetroAchievements. Roda sob demanda e edita
direto o campo `retroachievements` de cada
`src/content/hobbies/pokemon/games/<slug>.md` — não escreve JSON nenhum.

- **Só precisa de `RA_API_KEY`** — lê o catálogo público de jogos, não o
  progresso de ninguém.
- **O console vem do projeto**, do campo `platforms` de cada game.md; os ids
  vêm da API. A curadoria no script é só o *título esperado* de cada jogo.
- **Casamento é por título normalizado e exato.** O RetroAchievements tem
  centenas de romhacks (`~Hack~ Pokémon Brown`) e subsets
  (`… [Subset - Professor Oak Challenge]`) que um "contém" pegaria por engano.
- **Pagine sempre:** `API_GetGameList` devolve no máximo 500 por chamada mesmo
  com `c` maior. Sem paginar, HeartGold/SoulSilver sumiam por cair depois do
  corte alfabético.
- **Ausência é resultado, não erro.** Cada jogo termina com `retroachievements:
  { supported: true, ... }` ou `{ supported: false, reason }` no seu game.md.
  Hoje: 22 relacionados; 23 fora (3DS e Switch não são emulados no RA) e 3
  versões japonesas sem conquistas próprias.
- **Versão dupla:** HG/SS são uma entrada só lá (`… | …`), então os dois slugs
  apontam pro mesmo id — o conjunto de conquistas é compartilhado mesmo.
- Quando um título não casa, o script imprime os títulos parecidos daquele
  console, pra corrigir a lista `TITLES` sem caçar na mão, e não toca no
  campo `retroachievements` daquele jogo (mantém o que já tinha em vez de
  arriscar um chute errado).

Leitura: campo `retroachievements` de cada game.md, exposto por
`retroGameFor(slug)` / `retroUnsupportedReason(slug)` em `src/lib/pokemon.ts`
(via `getCollection('pokemonGames')`).

Leitura: `retroGameFor(slug)` / `retroUnsupportedReason(slug)` em
`src/lib/pokemon.ts` (via `import.meta.glob`, tolerante ao arquivo não existir).

# Diretriz: Dados e sincronização

> Como o app guarda o que o usuário altera. Fonte da verdade — mudou aqui →
> ajuste o projeto (e vice-versa).

## Princípio (acertado)

- **Local-first, sem backend.** Todo estado editável do usuário fica em
  **IndexedDB**, no dispositivo. **Não há servidor** e **não há sync automático
  entre dispositivos**.
- **Portabilidade = backup manual.** Levar dados entre aparelhos é via
  **Exportar / Importar JSON** (componente `Backup`).
- Só introduzir sync remoto (GitHub API, backend, etc.) **depois de mudar esta
  diretriz** explicitamente.

## Camada de acesso: `src/lib/store.ts`

Toda leitura/escrita de estado passa por aqui. Não acessar `indexedDB` direto em
componentes.

- Banco: `minha-agenda` (idb). Versão atual: **2**.
- Object stores:
  - **`checks`** — booleanos. Usado por checklists e pelo "comprado" de gunpla.
  - **`notes`** — strings. Anotações livres futuras.
  - **`prices`** — números. Valores em R$ (ex.: preço pago de um kit).
- API: `getCheck/setCheck`, `getNote/setNote`, `getPrice/setPrice/deletePrice`,
  `exportAll/importAll`, `clearAll`.
- Ao adicionar um novo object store, **incremente `DB_VERSION`** e trate a
  criação no `upgrade`, inclua no `exportAll/importAll/clearAll`, e atualize esta
  lista.

## Convenção de chaves

Chave = `"<escopo>::<id-estável>"`, para não colidir entre páginas:

- **Checklist:** `"<slug-do-doc>::<hash-do-texto-do-item>"`
  (o hash do texto evita que reordenar itens perca o estado).
- **Gunpla comprado:** `"gunpla-bought::<slug-do-kit>"` (store `checks`).
- **Gunpla preço pago:** `"gunpla-paid::<slug-do-kit>"` (store `prices`, R$).
- Novos recursos seguem o mesmo padrão de prefixo por escopo.

## Preço pago vs projeção (gunpla)

- A **projeção inicial** de um kit é `priceYen` convertido a R$ pela cotação fixa.
- O **preço pago** (R$) fica no store `prices` e é editável só quando o kit está
  comprado. A **diferença** exibida = `pago − projeção` (negativo = abaixo/economia,
  positivo = acima). Há diferença por kit e agregada (só sobre os kits com preço
  pago informado).

## Hidratação no cliente

- A página renderiza o HTML (estado "vazio"); um `<script>` do layout chama o
  inicializador (ex.: `initChecklists()`, `initGunplaWishlist()`), que lê do
  IndexedDB e aplica o estado + listeners de `change` que persistem.
- Regra: **o Markdown/frontmatter é a fonte da verdade do conteúdo**; o
  IndexedDB é a fonte da verdade só do **estado de interação**.

## Backup (export/import)

- `exportAll()` gera um JSON `{ app, version, exportedAt, checks, notes }`.
- `importAll()` faz merge por chave (não apaga o que não veio no arquivo).
- Formato versionado (`version`) para permitir migração futura.

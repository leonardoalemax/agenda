# Sync entre iPad e iPhone

Sem banco, sem SQL, sem servidor. O app guarda um snapshot do seu estado
(checks, notas, preços) num **gist privado do GitHub** e usa a regra
**"o mais novo vence"**.

O IndexedDB continua sendo a fonte de verdade da tela: **offline funciona
sempre**, com ou sem token.

## Ligar (uma vez por aparelho)

1. Crie um token: <https://github.com/settings/tokens/new?scopes=gist&description=Minha%20Agenda>
   (o link já vem com o escopo `gist` marcado — **não marque mais nada**).
2. Copie o token. O GitHub só mostra uma vez.
3. Na home do app: **Sync → Configurar**, cole e **Salvar**.
4. Repita no outro aparelho com **o mesmo token**.

Não há id de gist pra copiar: o app procura um gist com o arquivo
`minha-agenda.json` e cria sozinho na primeira vez.

## Quando sincroniza

- Ao abrir o app
- Ao voltar pra aba/PWA (é aí que costuma existir novidade do outro aparelho)
- Ao voltar a rede
- A cada 30s com o app em foco
- 1,5s depois que você para de mexer

A bolinha ao lado de "Sync" mostra o estado: cinza (desligado), laranja
(sincronizando), verde (em dia), vermelho (erro, com a mensagem ao lado).

## O que "o mais novo vence" significa

O snapshot é comparado **inteiro**, por carimbo de tempo — não há mesclagem por
item. Se você editar no iPad e no iPhone **enquanto os dois estão offline**, ao
voltarem à rede o que gravou por último substitui o outro por completo.

Foi a escolha combinada: mais simples de entender e de confiar do que uma
mesclagem automática que pode inventar resultado estranho. Se um dia isso
incomodar, o lugar de mudar é `syncNow()` em
[`src/lib/gist-sync.ts`](../src/lib/gist-sync.ts).

## Segurança

- O token **nunca entra no build** nem no repositório — ele vive só no
  IndexedDB do aparelho onde você colou.
- Um token com escopo `gist` alcança **todos os seus gists**, não dá pra
  restringir a um só. Por isso: marque **apenas** `gist`, nada de `repo`.
- Para revogar acesso, apague o token em
  <https://github.com/settings/tokens>. Isso derruba **todos** os aparelhos —
  não existe logout de um só.
- O botão **Esquecer** remove o token só daquele aparelho; o gist continua lá.

## Se der errado

- **"token inválido ou revogado"** — token errado, expirado ou apagado no GitHub.
- **"token sem permissão de gist"** — falta o escopo `gist`; crie outro.
- **"offline — sincroniza ao voltar a rede"** — normal, nada a fazer.
- **Nada acontece entre os aparelhos** — confirme que os dois têm token salvo
  (o botão "Sincronizar" só aparece quando há token) e toque nele nos dois.
- **Página parece velha depois de atualizar o app** — service worker com cache
  antigo: DevTools → Application → Service Workers → Unregister, e recarregue.

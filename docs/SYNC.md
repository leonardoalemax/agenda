# Sync entre aparelhos (e leitura pública)

Sem banco próprio, sem SQL, sem servidor nosso. O app guarda um snapshot do
estado (checks, notas, preços, saves de Pokémon) num documento do
**Firestore** e usa a regra **"o mais novo vence"**.

O IndexedDB continua sendo a fonte de verdade da tela: **offline funciona
sempre**, com ou sem rede, com ou sem login.

A diferença pro sync antigo (Gist): **qualquer visitante lê os dados em tempo
real**, mesmo sem logar — é assim que o site funciona como página pública.
Só **uma conta Google** (a sua) tem permissão de **escrever**.

## Configurar (uma vez, no projeto)

1. Crie um projeto em <https://console.firebase.google.com>.
2. **Authentication → Sign-in method** → habilite **Google**.
3. **Firestore Database** → crie o banco (modo produção) → aba **Regras** →
   cole o conteúdo de [`firestore.rules`](../firestore.rules) (raiz do repo) →
   **Publicar**.
4. **Configurações do projeto → Geral → Seus apps** → registre um app **Web**
   (ícone `</>`) se ainda não tiver um → copie o bloco `firebaseConfig`.
5. Preencha o `.env` local (veja `.env.example`) com essas chaves, prefixo
   `PUBLIC_FIREBASE_*`, mais `PUBLIC_ADMIN_EMAIL` com o e-mail da sua conta
   Google — **tem que ser o mesmo e-mail fixo em `firestore.rules`**. Isso é
   só pra rodar `npm run dev`/`build` na sua máquina — o `.env` nunca vai pro
   repositório.
6. **No GitHub** (pro deploy publicado, via [`deploy.yml`](../.github/workflows/deploy.yml)):
   repo → **Settings → Secrets and variables → Actions → aba Variables** →
   **New repository variable**, uma pra cada chave do passo 5 (mesmo nome,
   `PUBLIC_FIREBASE_API_KEY` etc. + `PUBLIC_ADMIN_EMAIL`). É **Variables**, não
   **Secrets** — essas chaves não são segredo (vão pro bundle público do
   navegador de qualquer jeito), só ficam fora do repositório por organização.
   Sem isso configurado, o build do GitHub Actions gera um site sem Firebase
   (login não funciona, sync fica em branco).

Isso é configuração de projeto (uma vez), não por aparelho — diferente do
token do Gist antigo, aqui não tem nada pra colar na tela do app. Basta abrir
o site e **Entrar com Google** com a conta admin.

## Ligar (em cada aparelho seu)

1. Abra o app, na home clique **Entrar com Google**.
2. Escolha a conta que bate com `PUBLIC_ADMIN_EMAIL`.
3. Pronto — os controles de edição (checkboxes, botões, etc.) que estavam
   travados ganham vida assim que o login confirma.

Em qualquer outro aparelho (ou navegador anônimo), **sem logar**, os dados já
aparecem — só não dá pra editar.

## Quando sincroniza

- **Leitura:** em tempo real (`onSnapshot`), pra todo mundo, o tempo todo que
  a aba estiver aberta e online.
- **Escrita** (só admin logado): 1,5s depois que você para de mexer
  (debounce) — evita gravar a cada tecla.
- **Login/logout:** reavalia na hora quem é mais novo (local vs. nuvem) — é
  assim que o primeiro snapshot nasce: você loga num aparelho que já tem dado
  local, e como a nuvem ainda não tem nada, ele publica sozinho.

A bolinha ao lado de "Sync" mostra o estado: cinza (conectando/leitura),
laranja (enviando), verde (em dia), vermelho (erro, com a mensagem ao lado).

## O que "o mais novo vence" significa

O snapshot é comparado **inteiro**, por carimbo de tempo — não há mesclagem
por item. Se você editar em dois aparelhos **enquanto os dois estão offline**
(ambos logados como admin), ao voltarem à rede o que gravou por último
substitui o outro por completo.

Foi a escolha combinada: mais simples de entender e de confiar do que uma
mesclagem automática que pode inventar resultado estranho. Se um dia isso
incomodar, o lugar de mudar é `reconcile()`/`pushLocal()` em
[`src/lib/firestore-sync.ts`](../src/lib/firestore-sync.ts).

## Segurança

- **Quem decide quem escreve é o `firestore.rules`**, publicado no console do
  Firebase — não o código do site. O e-mail admin fica fixo ali (Firestore
  Rules não leem `.env`); se um dia trocar de conta, tem que atualizar **os
  dois**: `firestore.rules` (republicar no console) e `PUBLIC_ADMIN_EMAIL`.
- As chaves `PUBLIC_FIREBASE_*` **não são segredo** — o SDK client precisa
  delas em runtime, ficam no bundle público de propósito. A segurança nunca
  dependeu de escondê-las.
- Pra revogar seu próprio acesso num aparelho perdido/roubado: **Firebase
  Console → Authentication → usuários** → revogar sessões, ou trocar a senha
  da conta Google.
- Qualquer pessoa pode logar com **qualquer conta Google** — só a que bate
  com o e-mail admin ganha permissão de escrita; as demais viram visitante
  (mesmo efeito de não logar).

## Se der errado

- **Botão "Entrar com Google" não abre nada / popup bloqueado** — o navegador
  bloqueou o popup; permita popups pra este site e tente de novo.
- **Logou mas os controles continuam travados** — o e-mail da conta que você
  usou não bate com `PUBLIC_ADMIN_EMAIL` (o painel de sync mostra qual e-mail
  logou). Confirme que é a conta certa.
- **"Missing or insufficient permissions"** — o `firestore.rules` publicado no
  console não bate com o e-mail admin, ou ainda não foi publicado. Revise o
  passo 3 de "Configurar".
- **Nada acontece entre os aparelhos** — confirme que os dois estão online e
  que você logou como admin nos dois (visitante só lê, nunca escreve).
- **Página parece velha depois de atualizar o app** — service worker com cache
  antigo: use o botão **atualizar** no topo do app (ele limpa o cache sozinho),
  ou DevTools → Application → Service Workers → Unregister, e recarregue.

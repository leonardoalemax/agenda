import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Coleção "agenda": diários, checklists e páginas custom.
// O campo `type` no frontmatter decide o layout.
//
// A exclusão é `hobbies/**` inteiro, não só os `.md`: além das coleções com
// schema próprio (gunpla), `hobbies/` guarda JSON de dados (pokédex, marcas de
// origem, mapa do RetroAchievements, conquistas). Excluindo só `.md`, esses
// JSON entravam aqui e estouravam o schema com "title: Required".
const agenda = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!hobbies/**'], base: './src/content' }),
  schema: z.object({
    // tipo de conteúdo -> layout dedicado
    type: z.enum(['diario', 'checklist', 'custom']).default('custom'),
    title: z.string(),
    date: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    summary: z.string().optional(),
    // usado só por checklists: mostra barra de progresso
    progress: z.boolean().default(true),
  }),
});

// Hobby: Gunpla. Cada kit é um .md (corpo = conteúdo futuro do kit).
// A tag `wishlist` marca o que entra na página de wishlist.
const gunpla = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hobbies/gunpla' }),
  schema: z.object({
    type: z.literal('gunpla').default('gunpla'),
    name: z.string(),
    grade: z.string().optional(), // HG | RG | EG | MG ...
    scale: z.string().default('1/144'),
    code: z.string().optional(), // ex.: GN-001
    priceYen: z.number(),
    image: z.string().optional(), // caminho local em public/ (ex.: hobbies/gunpla/slug.jpg)
    tags: z.array(z.string()).default([]),
    date: z.coerce.date().optional(),
    summary: z.string().optional(),
  }),
});

// Hobby: Pokémon — jogos e dexes. Cada .md é um jogo (ou dex) inteiro
// compilado num arquivo só (posse de mídia, layout de caixa, marca de
// origem, suporte a Bank/HOME/transporte, conquistas na RA, marcos/insígnias)
// — antes isso vinha espalhado em ~7 JSON em data/. Gerado por
// `npm run pokemon:to-content` a partir desses JSON, que continuam em disco
// só como histórico/fonte; a app não lê mais eles.
const pokemonGames = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hobbies/pokemon/games' }),
  schema: z.object({
    type: z.literal('pokemon-game'),
    slug: z.string(),
    name: z.string(),
    // Ordem de exibição dentro da geração (não é alfabética — ex.: x, y,
    // omega-ruby, alpha-sapphire). getCollection() não garante ordem de
    // arquivo, então isso precisa ser dado explícito.
    order: z.number(),
    generation: z.string(),
    generationId: z.number(),
    region: z.string(),
    dexLimit: z.number(),
    pokedexes: z.array(z.string()),
    cover: z.string(),
    platforms: z.array(
      z.object({
        platform: z.string(),
        media: z.array(z.enum(['physical', 'digital'])),
      }),
    ),
    boxLayout: z.object({
      cols: z.number(),
      perBox: z.number(),
      type: z.enum(['graphic-grid', 'icon-list', 'infinite-list']),
    }),
    originMark: z.string().nullable(),
    transfer: z.object({
      bank: z.boolean(),
      home: z.boolean(),
      transport: z.boolean(),
    }),
    retroachievements: z.discriminatedUnion('supported', [
      z.object({
        supported: z.literal(true),
        raId: z.number(),
        raTitle: z.string(),
        console: z.string(),
        achievements: z.number(),
        points: z.number(),
      }),
      z.object({
        supported: z.literal(false),
        reason: z.string().nullable(),
      }),
    ]),
    marcos: z.array(z.object({ nome: z.string(), icon: z.string() })),
  }),
});

const pokemonDexes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hobbies/pokemon/dexes' }),
  schema: z.object({
    type: z.literal('pokemon-dex'),
    key: z.string(),
    count: z.number(),
    entries: z.array(z.object({ number: z.number(), species: z.string() })),
  }),
});

// Um arquivo só, todo pokémon que existe (identidade: nome + número
// nacional). Não confundir com pokemonDexes: uma dex referencia um
// subconjunto dessas espécies numerado do jeito daquela dex específica
// (Bulbasaur é #1 em Kanto, outro número numa dex estendida); esta
// collection é a identidade única de cada espécie, não uma listagem por jogo.
const pokemonSpecies = defineCollection({
  loader: glob({ pattern: 'pokemon.md', base: './src/content/hobbies/pokemon' }),
  schema: z.object({
    type: z.literal('pokemon-species-list'),
    count: z.number(),
    species: z.array(
      z.object({
        number: z.number(),
        slug: z.string(),
        name: z.string(),
      }),
    ),
  }),
});

// Hobby: Cheevos (conquistas do RetroAchievements). Retrato do último
// `npm run cheevos:sync`, commitado — em runtime o site nunca fala com a API
// (diretriz 2: offline sempre; diretriz 3: sem backend). Antes vinha de
// index.json (lista leve) + games/<id>.json (conquistas de cada jogo);
// agora cada jogo é um .md só, com as conquistas embutidas, e os totais
// (jogos/conquistas/pontos/masterizados) são somados na leitura em vez de
// guardados à parte — nunca podem ficar dessincronizados do que os jogos
// realmente têm.
const cheevosGames = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hobbies/cheevos/games' }),
  schema: z.object({
    type: z.literal('cheevos-game'),
    id: z.number(),
    title: z.string(),
    console: z.string(),
    icon: z.string(),
    total: z.number(),
    earned: z.number(),
    earnedHardcore: z.number(),
    points: z.number(),
    earnedPoints: z.number(),
    award: z.enum(['mastered', 'completed', 'beaten-hardcore', 'beaten-softcore']).nullable(),
    awardedAt: z.string().nullable(),
    lastPlayedAt: z.string().nullable(),
    achievements: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        description: z.string(),
        points: z.number(),
        badge: z.string(),
        type: z.string().nullable(),
        order: z.number(),
        earnedAt: z.string().nullable(),
        earnedHardcoreAt: z.string().nullable(),
      }),
    ),
  }),
});

// Um arquivo só: metadado do sync (usuário, quando rodou). Os totais não
// moram aqui — são somados a partir de cheevosGames na leitura.
const cheevosSync = defineCollection({
  loader: glob({ pattern: 'sync.md', base: './src/content/hobbies/cheevos' }),
  schema: z.object({
    type: z.literal('cheevos-sync'),
    user: z.string(),
    syncedAt: z.string(),
  }),
});

export const collections = {
  agenda,
  gunpla,
  pokemonGames,
  pokemonDexes,
  pokemonSpecies,
  cheevosGames,
  cheevosSync,
};

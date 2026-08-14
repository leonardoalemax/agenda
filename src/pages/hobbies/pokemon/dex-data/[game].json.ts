// Endpoint estático (gerado no build, um arquivo .json por jogo) com a dex
// crua do jogo: espécies + sprite id + layout de caixa. Existe pra alimentar
// a tela de HOME, que não sabe em build-time quais jogos vai precisar
// mostrar (depende de quais saves o usuário marcou como "movido pro HOME")
// — em vez de embutir a dex dos 48 jogos na página, ela busca só a de quem
// precisa, on demand. Cai no precache do PWA como qualquer outro asset
// (globPatterns já cobre .json).
import type { APIRoute } from 'astro';
import { allGenerations, dexForGame, layoutForGame } from '../../../../lib/pokemon';

export async function getStaticPaths() {
  const gens = allGenerations();
  return gens.flatMap((gen) =>
    gen.games.map((g) => ({
      params: { game: g.slug },
      props: { genName: gen.name, game: g.slug },
    })),
  );
}

interface Props {
  genName: string;
  game: string;
}

export const GET: APIRoute = ({ props }) => {
  const { genName, game } = props as Props;
  const entries = dexForGame(genName, game);
  const layout = layoutForGame(game);
  return new Response(JSON.stringify({ game, layout, entries }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

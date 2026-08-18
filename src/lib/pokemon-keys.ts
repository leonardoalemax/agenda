// Funções puras do modelo Pokémon — sem I/O, sem `astro:content`.
//
// Único módulo do hobby Pokémon que pode ser importado tanto no servidor
// (.astro, build) quanto no cliente (pokemon-client.ts, que roda no
// navegador). `pokemon.ts` lê as content collections via `astro:content`,
// que só existe em contexto de build/servidor — importar ele do cliente
// quebraria o bundle. Tudo aqui não depende de dado nenhum, só de
// argumentos, então é seguro nos dois lados.
export type Media = "physical" | "digital";

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[()]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export function mediaLabel(media: Media): string {
	return media === "physical" ? "físico" : "digital";
}

// ===== chaves do IndexedDB (ver docs/diretrizes/dados-e-sync.md) =====

export function ownedKey(game: string, media: Media): string {
	return `pokemon-owned::${game}::${media}`;
}

export function caughtKey(saveId: string, species: string): string {
	return `pokemon-caught::${saveId}::${species}`;
}

export function marcoKey(saveId: string, marco: string): string {
	return `pokemon-marco::${saveId}::${marco}`;
}

/** Chave estável por marco dentro de um save — o dado não tem id, só o nome. */
export function marcoId(nome: string): string {
	return slugify(nome);
}

export function spritePath(id: number): string {
	return `hobbies/pokemon/sprites/${id}.png`;
}

export function coverPath(game: string): string {
	return `hobbies/pokemon/covers/${game}.webp`;
}

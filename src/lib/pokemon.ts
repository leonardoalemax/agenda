// Modelo do hobby Pokémon.
//
// Dois conceitos separados, de propósito:
// - **Posse do jogo**: você tem o jogo, físico e/ou digital — sem amarrar a
//   uma plataforma específica. Um FireRed comprado em GBA e resgatado depois
//   no Switch é "tenho físico e digital de FireRed", não duas linhas.
// - **Save**: uma jogada de verdade — treinador + jogo — com pokedex própria.
//   Pode haver vários saves do mesmo jogo (um Ruby zerado, outro em progresso).
//   Saves são dados do usuário (IndexedDB via src/lib/store.ts), não vêm daqui.
//
// Os dados em si vêm das content collections `pokemonGames`/`pokemonDexes`
// (src/content/hobbies/pokemon/{games,dexes}/*.md, geradas por
// `npm run pokemon:to-content`) via `astro:content` — por isso este módulo só
// pode ser importado no servidor (.astro, build), nunca em pokemon-client.ts,
// que roda no navegador e não tem acesso a `astro:content`. Funções puras
// (sem dado, seguras nos dois lados) moraram pra pokemon-keys.ts.
import { getCollection } from "astro:content";
import {
	type Media,
	slugify,
	mediaLabel,
	ownedKey,
	caughtKey,
	marcoKey,
	marcoId,
	spritePath,
	coverPath,
} from "./pokemon-keys";

export {
	type Media,
	slugify,
	mediaLabel,
	ownedKey,
	caughtKey,
	marcoKey,
	marcoId,
	spritePath,
	coverPath,
};

export interface Generation {
	id: number;
	name: string;
	region: string;
	limit: number;
	games: Array<{ slug: string; pokedexes: string[] }>;
}

export interface BoxLayout {
	cols: number;
	perBox: number;
	type: "graphic-grid" | "icon-list" | "infinite-list";
	/** derivado: perBox ÷ cols. É a altura da caixa, em linhas. */
	rows: number;
}

export interface DexEntry {
	number: number;
	species: string;
	name: string;
	id: number;
}

export interface TransferSupport {
	bank: boolean;
	home: boolean;
	transport: boolean;
}

export interface RetroGame {
	raId: number;
	raTitle: string;
	console: string;
	achievements: number;
	points: number;
}

export interface Marco {
	nome: string;
	url: string;
}

// ===== carrega as collections uma vez; módulo ESM é cacheado, então isso
// roda só na primeira importação do build inteiro. =====

const gameEntries = await getCollection("pokemonGames");
const dexEntries = await getCollection("pokemonDexes");
const speciesEntries = await getCollection("pokemonSpecies");

const gamesBySlug = new Map(gameEntries.map((e) => [e.data.slug, e.data]));
const dexesByKey = new Map(dexEntries.map((e) => [e.data.key, e.data]));
/** pokemon.md é um arquivo só (toda espécie que existe) — pega a lista de dentro dele. */
const speciesBySlug = new Map(
	(speciesEntries[0]?.data.species ?? []).map((s) => [s.slug, s]),
);

/** Reconstrói o agrupamento por geração, na ordem gravada em `order`. */
const gens: Generation[] = (() => {
	const byGen = new Map<number, Generation>();
	const sorted = [...gameEntries].sort((a, b) => a.data.order - b.data.order);
	for (const { data } of sorted) {
		let gen = byGen.get(data.generationId);
		if (!gen) {
			gen = { id: data.generationId, name: data.generation, region: data.region, limit: data.dexLimit, games: [] };
			byGen.set(data.generationId, gen);
		}
		gen.games.push({ slug: data.slug, pokedexes: data.pokedexes });
	}
	return [...byGen.values()].sort((a, b) => a.id - b.id);
})();

export function allGenerations(): Generation[] {
	return gens;
}

export function generationOf(game: string): Generation | undefined {
	return gens.find((g) => g.games.some((x) => x.slug === game));
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
export function generationLabel(gen: Generation): string {
	return `Geração ${ROMAN[gen.id - 1] ?? gen.id}`;
}

export function gameName(slug: string): string {
	return gamesBySlug.get(slug)?.name ?? slug;
}

/**
 * Mídias em que o jogo existe, somando todas as plataformas — a plataforma em
 * si não aparece na posse, só decide se físico e/ou digital são possíveis.
 * Ex.: FireRed = GBA físico + Switch digital → ['physical', 'digital'].
 */
export function mediaForGame(_genName: string, game: string): Media[] {
	const entry = gamesBySlug.get(game);
	if (!entry) return [];
	const set = new Set<string>();
	for (const p of entry.platforms) for (const m of p.media) set.add(m);
	return (["physical", "digital"] as const).filter((m) => set.has(m));
}

/** Plataformas em que o jogo existe (ex.: FireRed → GBA + Virtual Console 3DS). */
export function platformsForGame(_genName: string, game: string): string[] {
	return gamesBySlug.get(game)?.platforms.map((p) => p.platform) ?? [];
}

/** Fallback só pra espécie que por algum motivo não está em pokemon.md. */
function speciesNameFallback(species: string): string {
	return species
		.split("-")
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(" ");
}

export function speciesName(species: string): string {
	return speciesBySlug.get(species)?.name ?? speciesNameFallback(species);
}

/** Número na dex nacional — é o id do arquivo de sprite. */
export function nationalId(species: string): number {
	return speciesBySlug.get(species)?.number ?? 0;
}

/**
 * Espécies de um jogo, sem repetir, ordenadas pelo número da dex.
 * Um jogo pode juntar várias dexes (ex.: Kalos central/coastal/mountain);
 * nesse caso a numeração reinicia por dex, então numeramos em sequência.
 */
export function dexForGame(_genName: string, game: string): DexEntry[] {
	const entry = gamesBySlug.get(game);
	if (!entry) return [];

	const seen = new Set<string>();
	const out: DexEntry[] = [];
	for (const dexKey of entry.pokedexes) {
		const dex = dexesByKey.get(dexKey);
		for (const e of dex?.entries ?? []) {
			if (seen.has(e.species)) continue;
			seen.add(e.species);
			out.push({
				number: out.length + 1,
				species: e.species,
				name: speciesName(e.species),
				id: 0, // preenchido abaixo por nationalId()
			});
		}
	}
	return out.map((e) => ({ ...e, id: nationalId(e.species) }));
}

const DEFAULT_BOX_LAYOUT = { cols: 6, perBox: 30, type: "graphic-grid" as const };

export function layoutForGame(game: string): BoxLayout {
	const raw = gamesBySlug.get(game)?.boxLayout ?? DEFAULT_BOX_LAYOUT;
	const cols = Math.max(1, raw.cols);
	return { ...raw, cols, rows: Math.ceil(raw.perBox / cols) };
}

/** Quebra a dex em caixas do tamanho que o jogo usa. */
export function boxesFor(entries: DexEntry[], layout: BoxLayout): DexEntry[][] {
	const size = Math.max(1, layout.perBox);
	const out: DexEntry[][] = [];
	for (let i = 0; i < entries.length; i += size)
		out.push(entries.slice(i, i + size));
	return out;
}

/** Origin mark do jogo (o selo que indica de onde o pokémon veio), se houver um cadastrado. */
export function originMarkPath(game: string): string | null {
	return gamesBySlug.get(game)?.originMark ?? null;
}

// ===== ponte com o RetroAchievements (área Cheevos) =====

/** Jogo equivalente no RetroAchievements, ou null se não existe / sem mapa. */
export function retroGameFor(game: string): RetroGame | null {
	const ra = gamesBySlug.get(game)?.retroachievements;
	if (!ra || !ra.supported) return null;
	return { raId: ra.raId, raTitle: ra.raTitle, console: ra.console, achievements: ra.achievements, points: ra.points };
}

/** Por que este jogo não tem equivalente (console fora do RA), se for o caso. */
export function retroUnsupportedReason(game: string): string | null {
	const ra = gamesBySlug.get(game)?.retroachievements;
	if (!ra || ra.supported) return null;
	return ra.reason;
}

export function hasRetroMap(): boolean {
	return gameEntries.length > 0;
}

// ===== suporte a transferência (Bank / HOME / Transporte) =====

/** Quais métodos de transferência o jogo suporta. */
export function transferSupportFor(game: string): TransferSupport {
	const entry = gamesBySlug.get(game)?.transfer;
	return {
		bank: entry?.bank === true,
		home: entry?.home === true,
		transport: entry?.transport === true,
	};
}

// ===== marcos (insígnias e outros marcos pra completar o jogo) =====

/** Marcos do jogo (insígnias, líderes, etc.), ou [] se não cadastrado (ex.: Colosseum/XD). */
export function marcosForGame(game: string): Marco[] {
	const marcos = gamesBySlug.get(game)?.marcos ?? [];
	return marcos.map((m) => ({ nome: m.nome, url: m.icon }));
}

// Modelo do hobby Pokémon.
//
// Dois conceitos separados, de propósito:
// - **Posse do jogo**: você tem o jogo, físico e/ou digital — sem amarrar a
//   uma plataforma específica. Um FireRed comprado em GBA e resgatado depois
//   no Switch é "tenho físico e digital de FireRed", não duas linhas.
// - **Save**: uma jogada de verdade — treinador + jogo — com pokedex própria.
//   Pode haver vários saves do mesmo jogo (um Ruby zerado, outro em progresso).
//   Saves são dados do usuário (IndexedDB via src/lib/store.ts), não vêm daqui.
import generations from "../content/hobbies/pokemon/data/generations.json";
import platformsByGen from "../content/hobbies/pokemon/data/platforms-by-generation.json";
import pokedexes from "../content/hobbies/pokemon/data/pokedexes.json";
import boxLayout from "../content/hobbies/pokemon/data/box-layout.json";
import originMarkData from "../content/hobbies/pokemon/data/origin_mark.json";
import transferSupportData from "../content/hobbies/pokemon/data/transfer-support-by-game-slug.json";

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

export type Media = "physical" | "digital";

const gens = generations as Generation[];
const dexes = pokedexes as Record<
	string,
	Array<{ entry_number: number; pokemon_species: string }>
>;
/** Como está no JSON: sem `rows`, que é calculado em layoutForGame(). */
type RawBoxLayout = Omit<BoxLayout, "rows">;
const layouts = boxLayout as {
	default: RawBoxLayout;
	byGame: Record<string, RawBoxLayout>;
};
const platforms = platformsByGen as Record<
	string,
	Array<{
		game: string;
		platforms: Array<{ platform: string; media: string[] }>;
	}>
>;

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[()]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

// Nomes que a slugificação não acerta sozinha.
const GAME_NAMES: Record<string, string> = {
	firered: "FireRed",
	leafgreen: "LeafGreen",
	heartgold: "HeartGold",
	soulsilver: "SoulSilver",
	xd: "XD: Gale of Darkness",
	colosseum: "Colosseum",
	x: "X",
	y: "Y",
	"omega-ruby": "Omega Ruby",
	"alpha-sapphire": "Alpha Sapphire",
	"black-2": "Black 2",
	"white-2": "White 2",
	"ultra-sun": "Ultra Sun",
	"ultra-moon": "Ultra Moon",
	"lets-go-pikachu": "Let's Go, Pikachu!",
	"lets-go-eevee": "Let's Go, Eevee!",
	"the-isle-of-armor": "The Isle of Armor",
	"the-crown-tundra": "The Crown Tundra",
	"brilliant-diamond": "Brilliant Diamond",
	"shining-pearl": "Shining Pearl",
	"legends-arceus": "Legends: Arceus",
	"legends-za": "Legends: Z-A",
	"the-teal-mask": "The Teal Mask",
	"the-indigo-disk": "The Indigo Disk",
	"mega-dimension": "Mega Dimension",
};

export function gameName(slug: string): string {
	return (
		GAME_NAMES[slug] ??
		slug.replace(
			/(^|-)(\w)/g,
			(_, s, c) => (s ? " " : "") + c.toUpperCase(),
		)
	);
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
export function generationLabel(gen: Generation): string {
	return `Geração ${ROMAN[gen.id - 1] ?? gen.id}`;
}

export function mediaLabel(media: Media): string {
	return media === "physical" ? "físico" : "digital";
}

/**
 * Mídias em que o jogo existe, somando todas as plataformas — a plataforma em
 * si não aparece na posse, só decide se físico e/ou digital são possíveis.
 * Ex.: FireRed = GBA físico + Switch digital → ['physical', 'digital'].
 */
export function mediaForGame(genName: string, game: string): Media[] {
	const entry = (platforms[genName] ?? []).find((e) => e.game === game);
	if (!entry) return [];
	const set = new Set<string>();
	for (const pl of entry.platforms) for (const m of pl.media) set.add(m);
	return (["physical", "digital"] as const).filter((m) => set.has(m));
}

/** Plataformas em que o jogo existe (ex.: FireRed → GBA + Virtual Console 3DS). */
export function platformsForGame(genName: string, game: string): string[] {
	const entry = (platforms[genName] ?? []).find((e) => e.game === game);
	return entry?.platforms.map((p) => p.platform) ?? [];
}

export function allGenerations(): Generation[] {
	return gens;
}

export function generationOf(game: string): Generation | undefined {
	return gens.find((g) => g.games.some((x) => x.slug === game));
}

/**
 * Espécies de um jogo, sem repetir, ordenadas pelo número da dex.
 * Um jogo pode juntar várias dexes (ex.: Kalos central/coastal/mountain);
 * nesse caso a numeração reinicia por dex, então numeramos em sequência.
 */
export function dexForGame(genName: string, game: string): DexEntry[] {
	const gen = gens.find((g) => g.name === genName);
	const entry = gen?.games.find((g) => g.slug === game);
	if (!entry) return [];

	const seen = new Set<string>();
	const out: DexEntry[] = [];
	for (const dexKey of entry.pokedexes) {
		for (const e of dexes[dexKey] ?? []) {
			if (seen.has(e.pokemon_species)) continue;
			seen.add(e.pokemon_species);
			out.push({
				number: out.length + 1,
				species: e.pokemon_species,
				name: speciesName(e.pokemon_species),
				id: 0, // preenchido por nationalId()
			});
		}
	}
	return out.map((e) => ({ ...e, id: nationalId(e.species) }));
}

// id nacional = posição na dex nacional; é o número do arquivo de sprite
const nationalIndex = new Map<string, number>(
	(dexes.national ?? []).map((e) => [e.pokemon_species, e.entry_number]),
);

export function nationalId(species: string): number {
	return nationalIndex.get(species) ?? 0;
}

export function speciesName(species: string): string {
	return species
		.split("-")
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(" ");
}

export function layoutForGame(game: string): BoxLayout {
	const raw = layouts.byGame[game] ?? layouts.default;
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

// ===== chaves do IndexedDB (ver docs/diretrizes/dados-e-sync.md) =====

export function ownedKey(game: string, media: Media): string {
	return `pokemon-owned::${game}::${media}`;
}

export function caughtKey(saveId: string, species: string): string {
	return `pokemon-caught::${saveId}::${species}`;
}

export function spritePath(id: number): string {
	return `hobbies/pokemon/sprites/${id}.png`;
}

export function coverPath(game: string): string {
	return `hobbies/pokemon/covers/${game}.webp`;
}

interface OriginMarkEntry {
	jogo: string;
	marca: string;
	png_url: string;
}

const originMarks = originMarkData as OriginMarkEntry[];

// Mapeia slug de jogo → nome exato do campo "jogo" em origin_mark.json.
// Alguns jogos antigos (ex.: gen I/II) compartilham uma única entrada
// "(Virtual Console)" porque o mark de origem é o mesmo pra todos eles.
const ORIGIN_MARK_GAME_MAP: Record<string, string> = {
	x: "Pokémon X",
	y: "Pokémon Y",
	"omega-ruby": "Pokémon Omega Ruby",
	"alpha-sapphire": "Pokémon Alpha Sapphire",
	sun: "Pokémon Sun",
	moon: "Pokémon Moon",
	"ultra-sun": "Pokémon Ultra Sun",
	"ultra-moon": "Pokémon Ultra Moon",
	red: "Pokémon Red/Blue/Yellow (Virtual Console)",
	blue: "Pokémon Red/Blue/Yellow (Virtual Console)",
	yellow: "Pokémon Red/Blue/Yellow (Virtual Console)",
	gold: "Pokémon Gold/Silver/Crystal (Virtual Console)",
	silver: "Pokémon Gold/Silver/Crystal (Virtual Console)",
	crystal: "Pokémon Gold/Silver/Crystal (Virtual Console)",
	"lets-go-pikachu": "Pokémon: Let's Go, Pikachu!",
	"lets-go-eevee": "Pokémon: Let's Go, Eevee!",
	sword: "Pokémon Sword",
	shield: "Pokémon Shield",
	"brilliant-diamond": "Pokémon Brilliant Diamond",
	"shining-pearl": "Pokémon Shining Pearl",
	"legends-arceus": "Pokémon Legends: Arceus",
	"legends-za": "Pokémon Legends: Z-A",
	scarlet: "Pokémon Scarlet",
	violet: "Pokémon Violet",
};

/** Nome do arquivo local a partir da URL do Bulbapedia (mesmo basename usado em public/hobbies/pokemon/marks/). */
function markFileFromUrl(url: string): string {
	return decodeURIComponent(url.split("/").pop() ?? "");
}

/** Origin mark do jogo (o selo que indica de onde o pokémon veio), se houver um cadastrado. */
// ===== ponte com o RetroAchievements (área Cheevos) =====
//
// Gerado por `npm run pokemon:ra-map` e commitado. Lido por `import.meta.glob`
// porque o arquivo pode não existir (antes de rodar o script) — um import
// direto quebraria o build.

export interface RetroGame {
	raId: number;
	raTitle: string;
	console: string;
	achievements: number;
	points: number;
}

interface RetroMap {
	source: string;
	syncedAt: string;
	matched: Record<string, RetroGame>;
	unsupported: Record<string, string>;
}

const retroFiles = import.meta.glob<RetroMap>(
	"../content/hobbies/pokemon/data/retroachievements.json",
	{ eager: true, import: "default" },
);
const retroMap: RetroMap | null = Object.values(retroFiles)[0] ?? null;

/** Jogo equivalente no RetroAchievements, ou null se não existe / sem mapa. */
export function retroGameFor(game: string): RetroGame | null {
	return retroMap?.matched[game] ?? null;
}

/** Por que este jogo não tem equivalente (console fora do RA), se for o caso. */
export function retroUnsupportedReason(game: string): string | null {
	return retroMap?.unsupported[game] ?? null;
}

export function hasRetroMap(): boolean {
	return retroMap !== null;
}

export function originMarkPath(game: string): string | null {
	const jogo = ORIGIN_MARK_GAME_MAP[game];
	if (!jogo) return null;
	const entry = originMarks.find((m) => m.jogo === jogo);
	if (!entry) return null;
	return `hobbies/pokemon/marks/${markFileFromUrl(entry.png_url)}`;
}

// ===== suporte a transferência (Bank / HOME / Transporte) =====

export interface TransferSupport {
	bank: boolean;
	home: boolean;
	transport: boolean;
}

const transferSupport = transferSupportData as Record<
	string,
	{ bank?: boolean; home?: boolean; transport?: boolean }
>;

/** Quais métodos de transferência o jogo suporta. Ausente ou `false` no JSON = não suporta. */
export function transferSupportFor(game: string): TransferSupport {
	const entry = transferSupport[game];
	return {
		bank: entry?.bank === true,
		home: entry?.home === true,
		transport: entry?.transport === true,
	};
}

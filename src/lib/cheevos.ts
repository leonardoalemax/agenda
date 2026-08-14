// Modelo do hobby Cheevos (conquistas do RetroAchievements).
//
// Os dados são um retrato tirado no build por `npm run cheevos:sync` e
// commitado — em runtime o site nunca fala com a API do RetroAchievements
// (diretriz 2: offline sempre; diretriz 3: sem backend).
//
// Tudo é lido via `import.meta.glob` em vez de `import` direto porque antes do
// primeiro sync os arquivos não existem, e um import quebraria o build.

export interface CheevosGame {
	id: number;
	title: string;
	console: string;
	/** id da imagem em public/hobbies/cheevos/games/<icon>.png */
	icon: string;
	total: number;
	earned: number;
	earnedHardcore: number;
	points: number;
	earnedPoints: number;
	/** 'mastered' | 'completed' | 'beaten-hardcore' | 'beaten-softcore' | null */
	award: string | null;
	awardedAt: string | null;
	lastPlayedAt: string | null;
}

export interface Achievement {
	id: number;
	title: string;
	description: string;
	points: number;
	badge: string;
	/** 'progression' | 'win_condition' | 'missable' | null */
	type: string | null;
	order: number;
	earnedAt: string | null;
	earnedHardcoreAt: string | null;
}

export interface CheevosIndex {
	user: string;
	syncedAt: string;
	totals: {
		games: number;
		achievements: number;
		earned: number;
		points: number;
		mastered: number;
	};
	games: CheevosGame[];
}

interface GameFile {
	id: number;
	title: string;
	achievements: Achievement[];
}

const indexFiles = import.meta.glob<CheevosIndex>(
	"../content/hobbies/cheevos/data/index.json",
	{ eager: true, import: "default" },
);
const gameFiles = import.meta.glob<GameFile>(
	"../content/hobbies/cheevos/data/games/*.json",
	{ eager: true, import: "default" },
);

const index: CheevosIndex | null = Object.values(indexFiles)[0] ?? null;

const byId = new Map<number, GameFile>(
	Object.values(gameFiles).map((g) => [g.id, g]),
);

/** Retrato do último sync, ou null se o sync nunca rodou. */
export function cheevosIndex(): CheevosIndex | null {
	return index;
}

export function hasCheevos(): boolean {
	return (index?.games.length ?? 0) > 0;
}

export function allCheevosGames(): CheevosGame[] {
	return index?.games ?? [];
}

export function cheevosGame(id: number): CheevosGame | undefined {
	return index?.games.find((g) => g.id === id);
}

export function achievementsFor(id: number): Achievement[] {
	return byId.get(id)?.achievements ?? [];
}

/** Uma conquista conta como feita em qualquer modo (hardcore ou softcore). */
export function isEarned(a: Achievement): boolean {
	return Boolean(a.earnedAt || a.earnedHardcoreAt);
}

export function gameIconPath(icon: string): string {
	return `hobbies/cheevos/games/${icon}.png`;
}

/** Badge colorida quando feita, cinza (`_lock`) quando ainda falta. */
export function badgePath(badge: string, earned: boolean): string {
	return `hobbies/cheevos/badges/${badge}${earned ? "" : "_lock"}.png`;
}

const AWARD_LABELS: Record<string, string> = {
	mastered: "Masterizado",
	completed: "Completo",
	"beaten-hardcore": "Zerado (hardcore)",
	"beaten-softcore": "Zerado",
};

export function awardLabel(award: string | null): string | null {
	return award ? (AWARD_LABELS[award] ?? award) : null;
}

/** Jogos agrupados por console, console com mais jogos primeiro. */
export function gamesByConsole(): Array<{ console: string; games: CheevosGame[] }> {
	const map = new Map<string, CheevosGame[]>();
	for (const g of allCheevosGames()) {
		const list = map.get(g.console);
		if (list) list.push(g);
		else map.set(g.console, [g]);
	}
	return [...map.entries()]
		.map(([name, games]) => ({ console: name, games }))
		.sort((a, b) => b.games.length - a.games.length || a.console.localeCompare(b.console));
}

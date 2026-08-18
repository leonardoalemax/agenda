// Modelo do hobby Cheevos (conquistas do RetroAchievements).
//
// Os dados são um retrato tirado no build por `npm run cheevos:sync` e
// commitado — em runtime o site nunca fala com a API do RetroAchievements
// (diretriz 2: offline sempre; diretriz 3: sem backend).
//
// Vêm das content collections `cheevosGames`/`cheevosSync`
// (src/content/hobbies/cheevos/{games,sync.md}) via `astro:content` — por
// isso este módulo só pode ser importado no servidor (.astro, build).
import { getCollection } from "astro:content";

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

const gameEntries = await getCollection("cheevosGames");
const syncEntries = await getCollection("cheevosSync");

// Mais recente primeiro: é o que interessa olhar (mesma ordem de antes).
const games: CheevosGame[] = gameEntries
	.map(({ data }) => ({
		id: data.id,
		title: data.title,
		console: data.console,
		icon: data.icon,
		total: data.total,
		earned: data.earned,
		earnedHardcore: data.earnedHardcore,
		points: data.points,
		earnedPoints: data.earnedPoints,
		award: data.award,
		awardedAt: data.awardedAt,
		lastPlayedAt: data.lastPlayedAt,
	}))
	.sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? ""));

const achievementsByGameId = new Map(gameEntries.map((e) => [e.data.id, e.data.achievements]));

const sync = syncEntries[0]?.data ?? null;

/** Retrato do último sync, ou null se o sync nunca rodou. */
export function cheevosIndex(): CheevosIndex | null {
	if (!sync) return null;
	return {
		user: sync.user,
		syncedAt: sync.syncedAt,
		totals: {
			games: games.length,
			achievements: games.reduce((s, g) => s + g.total, 0),
			earned: games.reduce((s, g) => s + g.earned, 0),
			points: games.reduce((s, g) => s + g.earnedPoints, 0),
			mastered: games.filter((g) => g.award === "mastered").length,
		},
		games,
	};
}

export function hasCheevos(): boolean {
	return games.length > 0;
}

export function allCheevosGames(): CheevosGame[] {
	return games;
}

export function cheevosGame(id: number): CheevosGame | undefined {
	return games.find((g) => g.id === id);
}

export function achievementsFor(id: number): Achievement[] {
	return achievementsByGameId.get(id) ?? [];
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

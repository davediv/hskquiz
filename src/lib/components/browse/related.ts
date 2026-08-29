/**
 * The character graph: which shipped words share a character with the one you are reading.
 *
 * WHY THIS EXISTS
 * A dictionary entry that ends is a leaf, and a leaf is why you close the app and open Pleco.
 * The thing a paper dictionary cannot do and a phone can is let you walk sideways: you looked up
 * 安慰, so 安 is now a character you half-know, and the six other HSK words built on it are the
 * cheapest vocabulary you will ever learn. Pleco spends its entry screen on example sentences we
 * do not ship; this spends it on the 4,308 words we already do.
 *
 * WHAT IT COSTS
 * One pass over every level, built once per session and cached — ~7k pushes over 4,308 words,
 * measured at a couple of milliseconds. It holds references to the same `Word` objects the list
 * is already rendering, so the index itself is a few hundred KB of pointers, not a second copy
 * of the corpus. It is only built when something asks for it (`ensureCharIndex`), and the browse
 * screen asks on idle after its own level has landed, so a learner who never opens a word never
 * pays for the other four chunks.
 *
 * ORDERING
 * Levels ascending, then each level's own list order. That is not arbitrary: a level-5 learner
 * opening 安慰 should see 安静 and 安全 (HSK 2, already behind them) before 安装 (HSK 3), because
 * the ones they can already read are the ones that make the character stick.
 */

import { loadLevel } from '$lib/data';
import { LEVELS, type Level, type Word } from '$lib/types';
import { CHARACTER_GLOSS } from './charGloss';

/** Everything the app knows about one character. */
export interface CharEntry {
	/** The character itself. */
	char: string;
	/**
	 * The character standing alone as an HSK word, lowest level first, if it is one. 860 of the
	 * 1,500 characters in the corpus are. This is what gives the card a real gloss and a place
	 * to go; the rest fall back to `CHARACTER_GLOSS`.
	 */
	entry: Word | null;
	/** Every shipped word containing it, `entry` excluded, levels ascending. */
	words: readonly Word[];
}

export type CharIndex = ReadonlyMap<string, CharEntry>;

/**
 * Build the index from word lists given in level order. Exported for the spec — the app goes
 * through `ensureCharIndex`, which supplies the shipped lists.
 */
export function buildCharIndex(lists: readonly (readonly Word[])[]): CharIndex {
	const map = new Map<string, CharEntry>();

	for (const list of lists) {
		for (const word of list) {
			const chars = [...word.hanzi];
			// 爸爸 must not appear twice under 爸.
			const seen = new Set<string>();
			for (const char of chars) {
				if (seen.has(char)) continue;
				seen.add(char);

				let cell = map.get(char);
				if (!cell) {
					cell = { char, entry: null, words: [] };
					map.set(char, cell);
				}
				// 好 ships three times as a single-character word (good / very / to be fond of).
				// The first is the card's own entry; the other two stay in the list, which is
				// exactly where a learner wants to meet them.
				if (chars.length === 1 && cell.entry === null) {
					cell.entry = word;
				} else {
					(cell.words as Word[]).push(word);
				}
			}
		}
	}

	return map;
}

let index: CharIndex | null = null;
let building: Promise<CharIndex> | null = null;
let lists: ReadonlyMap<Level, readonly Word[]> | null = null;

/**
 * Every level's word list, once the index has been built — the same arrays `$lib/data` cached,
 * not a copy. This is what lets the screen answer "nothing here matches, but HSK 1 has one"
 * without a second round of dynamic imports, and it is null until something has asked for the
 * index, so nothing here forces the other four chunks down the wire.
 */
export function levelLists(): ReadonlyMap<Level, readonly Word[]> | null {
	return lists;
}

/**
 * The index, loading every level's chunk the first time. Concurrent callers share one build,
 * and a failure is not cached — the sheet degrades to a plain character strip and retries on
 * the next word.
 */
export function ensureCharIndex(): Promise<CharIndex> {
	if (index !== null) return Promise.resolve(index);
	if (building !== null) return building;

	building = Promise.all(LEVELS.map((level) => loadLevel(level)))
		.then((loaded) => {
			lists = new Map(LEVELS.map((level, i) => [level, loaded[i]]));
			index = buildCharIndex(loaded);
			building = null;
			return index;
		})
		.catch((error: unknown) => {
			building = null;
			throw error;
		});

	return building;
}

/** The built index, or null if nothing has asked for it yet. Never triggers a load. */
export function charIndexNow(): CharIndex | null {
	return index;
}

/** Test seam: forget the built index so a spec can build a different corpus. */
export function resetCharIndex(): void {
	index = null;
	building = null;
	lists = null;
}

/** One character card's worth of data. */
export interface CharCard {
	char: string;
	/** The character as a headword, if the corpus has it. Tappable. */
	entry: Word | null;
	/** Short English for the character alone — from `entry`, else the hand-written table. */
	gloss: string | null;
	/** The words to show, already trimmed to `limit`. */
	rows: readonly Word[];
	/** How many more contain it beyond `rows`. */
	more: number;
	/** How many contain it in total, `entry` and the open word excluded. */
	total: number;
}

/**
 * The card for one character of the word currently open. The open word is excluded — the whole
 * point of the strip is where else the character goes.
 */
export function charCard(
	idx: CharIndex | null,
	char: string,
	openWordId: string,
	limit: number
): CharCard {
	const cell = idx?.get(char);
	const entry = cell?.entry ?? null;
	const gloss = entry?.meanings[0] ?? CHARACTER_GLOSS[char] ?? null;

	if (!cell) return { char, entry, gloss, rows: [], more: 0, total: 0 };

	const others = cell.words.filter((word) => word.id !== openWordId);
	const rows = others.slice(0, Math.max(0, limit));
	return {
		char,
		entry: entry !== null && entry.id !== openWordId ? entry : null,
		gloss,
		rows,
		more: others.length - rows.length,
		total: others.length
	};
}

/**
 * How many words to list under each character.
 *
 * A two-character compound gets six each, which is a screen of somewhere to go. A 成语 has four
 * characters and would otherwise turn the sheet into a 24-row scroll, so the budget shrinks as
 * the word lengthens — total rows stay in the low teens whatever you opened.
 */
export function rowBudget(characterCount: number): number {
	if (characterCount <= 2) return 6;
	if (characterCount === 3) return 4;
	return 3;
}

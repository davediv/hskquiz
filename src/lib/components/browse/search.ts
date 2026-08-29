/**
 * Browse search: hanzi, pinyin or English, over one level's word list.
 *
 * ## Typing pinyin without tone marks
 *
 * Nobody browsing on a phone types `hǎo`. So both sides are folded to a plain-ASCII shape
 * before they meet:
 *
 *   index   `shǒu jī`   → `shou ji`   (spaced) and `shouji` (tight)
 *   query   `shou ji`   → `shou ji`               `shouji`
 *
 * `stripTone` handles the diacritics. On top of that, `ü` (and the `v` learners type for it,
 * and the plain `u` they type when they forget) all fold to `u`, so `nu`, `nv` and `nü` all
 * find 女. That over-matches slightly — `lu` also finds 绿 `lǜ` — which is the right trade for
 * a search box: a near miss you can see beats a hit you cannot reach.
 *
 * The list is not reliably syllable-spaced (`àihào` as often as `ài hào`), so both a spaced
 * and a tight form are indexed and a query is tried against both. A syllable-aligned prefix
 * (`hao` against `hǎo`, or against the second syllable of `nǐ hǎo`) outranks a hit that lands
 * mid-syllable.
 *
 * ## Ranking
 *
 * Ascending score, ties broken by the word's position in the official list, which is
 * alphabetical by pinyin — so equal-scoring results stay in the order the rest of the screen
 * shows them in, and the list never appears to reshuffle itself.
 *
 * ## Cost
 *
 * One index per level, built once and cached. A query is a linear pass of a dozen `indexOf`
 * calls over at most 1,071 entries — well under a frame, so there is no debounce and the list
 * updates on the keystroke.
 */

import { stripTone } from '$lib/design/tone';
import type { Level, Word } from '$lib/types';

interface Entry {
	word: Word;
	/** Position in the official list; the tiebreaker that keeps results in list order. */
	position: number;
	/** Simplified and traditional forms, concatenated — hanzi queries hit either. */
	hanzi: string;
	/** Tone-stripped, lowercase, single-spaced: `shou ji`. */
	pinyin: string;
	/** The same with every separator removed: `shouji`. */
	tight: string;
	/** Lowercase meanings joined and padded with spaces, so ` word ` tests a whole word. */
	meaning: string;
}

/** Separators the official pinyin uses: space, apostrophe, hyphen, variant slash, interpunct. */
const SEPARATORS = /[\s'’·∥/-]+/gu;

/** Fold pinyin to the shape both sides of a comparison are held in. */
function foldPinyin(text: string): string {
	return stripTone(text).toLowerCase().replace(/[üv]/gu, 'u').replace(SEPARATORS, ' ').trim();
}

function buildEntry(word: Word, position: number): Entry {
	const pinyin = foldPinyin(word.pinyin);
	return {
		word,
		position,
		hanzi: word.traditional ? `${word.hanzi} ${word.traditional}` : word.hanzi,
		pinyin,
		tight: pinyin.replace(/ /gu, ''),
		meaning: ` ${word.meanings.join(' | ').toLowerCase()} `
	};
}

const indexes = new Map<Level, Entry[]>();

/** Build (or reuse) the search index for a level's word list. */
function indexFor(level: Level, words: readonly Word[]): Entry[] {
	const cached = indexes.get(level);
	if (cached && cached.length === words.length && cached[0]?.word === words[0]) return cached;

	const built = words.map(buildEntry);
	indexes.set(level, built);
	return built;
}

export interface Query {
	/** What the learner typed, trimmed and lowercased. Empty means "no query". */
	text: string;
	/** The same, folded for pinyin comparison. */
	pinyin: string;
	/** The pinyin form with its spaces removed. */
	tight: string;
}

/** Prepare a raw input string for `matchScore`. Cheap; safe to call per keystroke. */
export function parseQuery(raw: string): Query {
	const text = raw.trim().toLowerCase();
	const pinyin = foldPinyin(text);
	return { text, pinyin, tight: pinyin.replace(/ /gu, '') };
}

/**
 * How well an entry answers a query — lower is better, `Infinity` is "no match".
 *
 * The bands are deliberately coarse: exact forms first, then the field ranking Pleco uses
 * (the character you drew, then the sound you typed, then the English you remembered), then
 * anything that merely contains the string.
 */
function matchScore(entry: Entry, query: Query): number {
	const { text, pinyin, tight } = query;
	let best = Infinity;

	if (entry.hanzi === text) return 0;
	if (entry.hanzi.startsWith(text)) best = 1;
	else if (entry.hanzi.includes(text)) best = 2;

	if (pinyin !== '') {
		if (entry.pinyin === pinyin || entry.tight === tight) best = Math.min(best, 3);
		else if (entry.pinyin.startsWith(pinyin) || entry.pinyin.includes(` ${pinyin}`)) {
			best = Math.min(best, 4);
		} else if (entry.tight.startsWith(tight)) best = Math.min(best, 5);
		else if (entry.tight.includes(tight)) best = Math.min(best, 6);
	}

	if (entry.meaning.includes(` ${text} `)) best = Math.min(best, 7);
	else if (entry.meaning.includes(` ${text}`)) best = Math.min(best, 8);
	else if (entry.meaning.includes(text)) best = Math.min(best, 9);

	return best;
}

/**
 * The words of `level` matching `raw`, best first.
 *
 * An empty query returns the given array itself — not a copy — so an unfiltered list keeps a
 * stable identity and the virtual list below it has nothing to reconcile.
 */
export function searchWords(level: Level, words: readonly Word[], raw: string): readonly Word[] {
	const query = parseQuery(raw);
	if (query.text === '') return words;

	const entries = indexFor(level, words);
	const hits: { entry: Entry; score: number }[] = [];
	for (const entry of entries) {
		const score = matchScore(entry, query);
		if (score !== Infinity) hits.push({ entry, score });
	}

	// Array.prototype.sort is stable, and position is unique, so this is a total order.
	hits.sort((a, b) => a.score - b.score || a.entry.position - b.entry.position);
	return hits.map((hit) => hit.entry.word);
}

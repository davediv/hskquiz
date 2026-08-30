/**
 * Browse search: hanzi, pinyin or English, over one level's word list.
 *
 * ## Typing pinyin without tone marks
 *
 * Nobody browsing on a phone types `hǎo`. So both sides are folded to a plain-ASCII shape
 * before they meet:
 *
 *   index   `chēng hào`  → `cheng` `hao`   (syllables)  and `chenghao` (tight)
 *   query   `chenghao`   →                              `chenghao`
 *
 * `stripTone` handles the diacritics. On top of that, `ü` (and the `v` learners type for it,
 * and the plain `u` they type when they forget) all fold to `u`, so `nu`, `nv` and `nü` all
 * find 女. That over-matches slightly — `lu` also finds 绿 `lǜ` — which is the right trade for
 * a search box: a near miss you can see beats a hit you cannot reach.
 *
 * ## Syllables, not letters
 *
 * A pinyin query is only ever compared at syllable boundaries. This is the whole difference
 * between a dictionary search and a substring search, and the printed string cannot supply it:
 * the official list writes 称号 as the unspaced `chēnghào`, so a matcher keyed off whitespace
 * has no boundary to align to and falls back to `indexOf`. `indexOf` is how "hao" returns
 * 超越 `chāoyuè` (the `hao` spans the end of `chao` and the start of `yue`) and ranks it above
 * the words that actually contain 号, and how "an" returns 41% of HSK 5.
 *
 * `Word.syllables` removes the ambiguity — it ships one `{ py, tone }` per character, built and
 * gate-checked against the reference — so the index stores the syllables themselves plus the
 * offset each one starts at, and a hit only counts when it *starts* on a boundary. It scores
 * better when it also *ends* on one:
 *
 *   query `hao`   称号 `cheng|hao`   starts and ends on a boundary   → whole-syllable hit
 *   query `sh`    老师 `lao|shi`     starts on one, ends inside      → still typing
 *   query `hao`   超越 `chao|yue`    starts inside `chao`            → not a hit at all
 *
 * ## Ranking
 *
 * Ascending score, ties broken by the word's position in the official list, which is
 * alphabetical by pinyin — so equal-scoring results stay in the order the rest of the screen
 * shows them in, and the list never appears to reshuffle itself.
 *
 * ## Cost
 *
 * One index per level, built once and cached. A query walks at most one syllable-start per
 * character of each entry — a couple of `startsWith` calls over at most 1,071 entries, well
 * under a frame, so there is no debounce and the list updates on the keystroke.
 */

import { stripTone } from '$lib/design/tone';
import type { Level, Word } from '$lib/types';
import { printedSyllables } from './pinyin';

interface Entry {
	word: Word;
	/** Position in the official list; the tiebreaker that keeps results in list order. */
	position: number;
	/** Simplified and traditional forms, concatenated — hanzi queries hit either. */
	hanzi: string;
	/** Every syllable, folded and run together: `chenghao`. */
	tight: string;
	/** Offset in `tight` where each syllable begins. Ascending, and always starts at 0. */
	starts: number[];
	/** Offsets in `tight` where a syllable ends, including the end of the string. */
	ends: Set<number>;
	/**
	 * Lowercase meanings joined and padded with spaces, so ` word ` tests a whole word — with
	 * every bracket, comma and terminator already folded to a space so the padding means what
	 * it says. Sense qualifiers put words straight after a `(`: "shirt (general word)".
	 */
	meaning: string;
}

/** Separators the official pinyin uses: space, apostrophe, hyphen, variant slash, interpunct. */
const SEPARATORS = /[\s'’·∥/-]+/gu;

/**
 * Punctuation that opens or closes a word inside a gloss rather than belonging to it.
 *
 * Apostrophes and hyphens are deliberately absent: "someone's" and "well-known" are single
 * words a learner types whole, and splitting them would lose the query that spells them out.
 */
const MEANING_BREAKS = /[()[\]{},;:!?"“”/]+/gu;

/** Fold a gloss (or an English query) so every word in it is delimited by a space. */
function foldMeaning(text: string): string {
	return text.toLowerCase().replace(MEANING_BREAKS, ' ').replace(/\s+/gu, ' ').trim();
}

/** Fold pinyin to the shape both sides of a comparison are held in. */
function foldPinyin(text: string): string {
	return stripTone(text).toLowerCase().replace(/[üv]/gu, 'u').replace(SEPARATORS, ' ').trim();
}

function buildEntry(word: Word, position: number): Entry {
	const starts: number[] = [];
	const ends = new Set<number>();
	let tight = '';

	for (const syllable of printedSyllables(word)) {
		const folded = foldPinyin(syllable).replace(/ /gu, '');
		if (folded === '') continue;
		starts.push(tight.length);
		tight += folded;
		ends.add(tight.length);
	}

	return {
		word,
		position,
		hanzi: word.traditional ? `${word.hanzi} ${word.traditional}` : word.hanzi,
		tight,
		starts,
		ends,
		meaning: ` ${foldMeaning(word.meanings.join(' | '))} `
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
	/** The same, folded for pinyin comparison and single-spaced. */
	pinyin: string;
	/** The pinyin form with its separators removed — what syllables are compared against. */
	tight: string;
	/** The same text folded the way the gloss index is, so brackets line up on both sides. */
	meaning: string;
}

/** Prepare a raw input string for `matchScore`. Cheap; safe to call per keystroke. */
export function parseQuery(raw: string): Query {
	const text = raw.trim().toLowerCase();
	const pinyin = foldPinyin(text);
	return { text, pinyin, tight: pinyin.replace(/ /gu, ''), meaning: foldMeaning(text) };
}

/* Score bands. Lower is better; `Infinity` is "no match". */
const HANZI_EXACT = 0;
const HANZI_PREFIX = 1;
const HANZI_INSIDE = 2;
/** The query is the word's whole pinyin: `haoyun` → 好运. */
const PY_WHOLE = 3;
/** Whole syllables from the start, but not all of them: `hao` → 好运. */
const PY_HEAD = 4;
/** Whole syllables, starting later in the word: `hao` → 称号. */
const PY_SYLLABLE = 5;
/** Starts at the first syllable and stops inside one — mid-keystroke: `haoy` → 好运. */
const PY_HEAD_PARTIAL = 6;
/** Starts at a later syllable and stops inside it: `sh` → 老师. */
const PY_PARTIAL = 7;
const MEANING_WORD = 8;
const MEANING_PREFIX = 9;

/**
 * English words a gloss is *built* from rather than *about*.
 *
 * The meanings are hand-authored learner copy — "an editor", "to dodge an issue", "a fund of
 * money" — so the articles and particles that open them appear in hundreds of entries each.
 * Typing "an" is a learner reaching for 安; it returned 98 words glossed with the article
 * before this list existed. A stopword is skipped for the English bands only: it is still a
 * perfectly good pinyin query, and "to" still finds 偷 `tōu`.
 */
const STOPWORDS: ReadonlySet<string> = new Set(
	'a an and as at be by for in is it of on or the to with'.split(' ')
);

/**
 * The best pinyin band this entry can offer the query, or `Infinity`.
 *
 * Only syllable starts are tried, so a query can never match across a syllable seam. That one
 * constraint is what keeps 超越 out of the results for "hao" — there is no boundary inside
 * `chao` for the `hao` to begin on.
 */
function pinyinScore(entry: Entry, tight: string): number {
	let best = Infinity;

	for (const start of entry.starts) {
		if (!entry.tight.startsWith(tight, start)) continue;

		const end = start + tight.length;
		const aligned = entry.ends.has(end);
		const head = start === 0;

		if (head && aligned) return end === entry.tight.length ? PY_WHOLE : PY_HEAD;

		const score = aligned ? PY_SYLLABLE : head ? PY_HEAD_PARTIAL : PY_PARTIAL;
		if (score < best) best = score;
	}

	return best;
}

/**
 * How well an entry answers a query — lower is better, `Infinity` is "no match".
 *
 * The bands are deliberately coarse: exact forms first, then the field ranking Pleco uses
 * (the character you drew, then the sound you typed, then the English you remembered).
 *
 * English matches must start a word. A meaning is two or three words long, so a match buried
 * inside one ("an" in "many") is never what was meant, and on a short query there are hundreds
 * of them — which is why the index is padded with spaces and the test is ` word `. That test
 * is also why a bracket has to become a space first: since the corpus started QUALIFYING
 * colliding senses, 衬衣 is glossed "shirt (general word)" and the word `general` opens on a
 * `(` rather than a space. `/browse/3?q=general` found nothing until the fold below existed.
 */
function matchScore(entry: Entry, query: Query): number {
	const { text, tight } = query;
	let best = Infinity;

	if (entry.hanzi === text) return HANZI_EXACT;
	if (entry.hanzi.startsWith(text)) best = HANZI_PREFIX;
	else if (entry.hanzi.includes(text)) best = HANZI_INSIDE;

	if (tight !== '') best = Math.min(best, pinyinScore(entry, tight));

	const english = query.meaning;
	if (english !== '' && !STOPWORDS.has(english)) {
		if (entry.meaning.includes(` ${english} `)) best = Math.min(best, MEANING_WORD);
		else if (entry.meaning.includes(` ${english}`)) best = Math.min(best, MEANING_PREFIX);
	}

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

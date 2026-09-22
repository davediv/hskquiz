/**
 * Part-of-speech codes, expanded, and the pairing of each code to the gloss it labels.
 *
 * `Word.pos` ships the official HSK 3.0 codes supported by a card's glosses (`N V Adj Adv
 * Pron Num M Prep Conj Aux Intj Prefix Suffix Phonetic`). `Word.meanings` is a separate list. Neither says
 * which label belongs to which gloss, so a row that prints `pos[0]` next to `meanings[0]`
 * will lie — 记录 is `N` then `V` over "to write down" then "a written record".
 *
 * When the corpus ships `Word.senses` that pairing is used as-is. Until it does, `sensesOf`
 * derives a best-effort match from the two arrays so the row chip and the sheet heading
 * describe the gloss they sit next to.
 *
 * Pleco prints the part of speech spelled out and upper-cased above the senses (`ADVERB`);
 * a list row has no room for that, so there are two registers here — an abbreviation for
 * the row and the full word for the detail sheet.
 */

import type { Sense, Word } from '$lib/types';

/** Abbreviation for a list row: short enough to sit in front of a meaning. */
const SHORT: Record<string, string> = {
	N: 'n.',
	V: 'v.',
	Adj: 'adj.',
	Adv: 'adv.',
	Pron: 'pron.',
	Num: 'num.',
	M: 'mw.',
	Prep: 'prep.',
	Conj: 'conj.',
	Aux: 'aux.',
	Intj: 'intj.',
	Prefix: 'pref.',
	Suffix: 'suf.',
	Phonetic: 'phon.'
};

/** The word itself, for the detail sheet. */
const LONG: Record<string, string> = {
	N: 'noun',
	V: 'verb',
	Adj: 'adjective',
	Adv: 'adverb',
	Pron: 'pronoun',
	Num: 'numeral',
	M: 'measure word',
	Prep: 'preposition',
	Conj: 'conjunction',
	Aux: 'auxiliary',
	Intj: 'interjection',
	Prefix: 'prefix',
	Suffix: 'suffix',
	Phonetic: 'phonetic particle'
};

/**
 * `["V","N"]` → `v./n.` — empty string when a word carries no annotation.
 *
 * Kept for the spec, which holds the two registers to the same code table; the row uses
 * `posAbbrev` on the sense beside the gloss, and the sheet `posWord` on each sense.
 */
export function posShort(pos: readonly string[]): string {
	return pos
		.map((code) => SHORT[code] ?? code.toLowerCase())
		.filter(Boolean)
		.join('/');
}

/** One code, abbreviated — `V` → `v.` — for the list-row chip. */
export function posAbbrev(code: string): string {
	return SHORT[code] ?? code.toLowerCase();
}

/** One code, spelled out — `V` → `verb` — for the sheet heading. */
export function posWord(code: string): string {
	return LONG[code] ?? code.toLowerCase();
}

/**
 * `['V','N']` → `v.` — the primary code only, for a list row.
 *
 * Prefer `sensesOf(word)[0]` and `posAbbrev` — this helper still exists for callers that
 * only have the code array. A reserved column only works if every value fits it, and the
 * joined form does not: `n.` is 1,666 rows and `pron./adv./conj.` is one.
 */
export function posPrimary(pos: readonly string[]): string {
	const first = pos[0];
	if (first === undefined) return '';
	return posAbbrev(first);
}

/** `['V','N']` → `verb · noun`, for the one place there is room to spell it out. */
export function posLong(pos: readonly string[]): string {
	return pos
		.map((code) => LONG[code] ?? code.toLowerCase())
		.filter(Boolean)
		.join(' · ');
}

/**
 * Consecutive senses that share a part of speech, for the sheet.
 *
 * Pleco heads a group (`ADVERB`) then lists its glosses; a joined `ADJECTIVE · VERB`
 * banner over an undifferentiated list is the thing this grouping exists to stop.
 */
export interface SenseGroup {
	pos?: string;
	items: { n: number; gloss: string }[];
}

export function groupSenses(senses: readonly Sense[]): SenseGroup[] {
	const groups: SenseGroup[] = [];
	for (let i = 0; i < senses.length; i++) {
		const sense = senses[i];
		if (sense === undefined) continue;
		const last = groups[groups.length - 1];
		if (last && last.pos === sense.pos) {
			last.items.push({ n: i + 1, gloss: sense.gloss });
		} else {
			groups.push({ pos: sense.pos, items: [{ n: i + 1, gloss: sense.gloss }] });
		}
	}
	return groups;
}

/**
 * Each gloss bound to the part of speech that labels it.
 *
 * Prefers `word.senses` when the corpus has shipped the pairing. Otherwise derives it
 * from `pos[]` + `meanings[]`: a verb-shaped gloss takes `V` even when `pos[0]` is `N`,
 * a measure-word gloss takes `M`, and a code with no matching gloss is left unused
 * rather than printed over a sense it does not describe.
 */
export function sensesOf(word: Word): Sense[] {
	const shipped = word.senses;
	if (shipped !== undefined && shipped.length > 0) return shipped;
	return pairMeanings(word.pos, word.meanings);
}

function pairMeanings(pos: readonly string[], meanings: readonly string[]): Sense[] {
	if (meanings.length === 0) return [];
	if (pos.length === 0) return meanings.map((gloss) => ({ gloss }));
	if (pos.length === 1) {
		const code = pos[0];
		return meanings.map((gloss) => (code === undefined ? { gloss } : { pos: code, gloss }));
	}

	const paired: Sense[] = meanings.map((gloss) => {
		const code = guessCode(gloss, pos);
		return code === undefined ? { gloss } : { pos: code, gloss };
	});

	const used = new Set(paired.map((sense) => sense.pos).filter((code) => code !== undefined));
	const leftover = pos.filter((code) => !used.has(code));
	const open = paired.filter((sense) => sense.pos === undefined);

	if (open.length === 0 || leftover.length === 0) return paired;

	if (open.length === leftover.length) {
		for (let i = 0; i < open.length; i++) {
			const sense = open[i];
			const code = leftover[i];
			if (sense && code !== undefined) sense.pos = code;
		}
		return paired;
	}

	if (leftover.length === 1) {
		const code = leftover[0];
		if (code !== undefined) for (const sense of open) sense.pos = code;
		return paired;
	}

	for (let i = 0; i < open.length; i++) {
		const sense = open[i];
		const code = leftover[i] ?? leftover[leftover.length - 1];
		if (sense && code !== undefined) sense.pos = code;
	}
	return paired;
}

/**
 * Which advertised code a gloss most likely belongs to, or `undefined` when none of the
 * available codes is a confident match. Confidence is cheap and local: infinitives are
 * verbs, "measure word: …" is M, a determiner is a noun. Everything else is leftover.
 */
function guessCode(gloss: string, available: readonly string[]): string | undefined {
	const text = gloss.trim();
	if (text === '') return undefined;
	const lower = text.toLowerCase();
	const pick = (...codes: string[]): string | undefined =>
		codes.find((code) => available.includes(code));

	if (/^measure word\b/i.test(text)) return pick('M');
	if (/^to\b/.test(lower)) return pick('V');
	if (/^(as if|as though)\b/.test(lower)) return pick('Adv', 'V');
	if (/^(a|an|the)\b/.test(lower)) return pick('N');
	return undefined;
}

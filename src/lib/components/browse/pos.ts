/**
 * Part-of-speech codes, expanded.
 *
 * `Word.pos` ships the codes the official HSK 3.0 list uses (`N V Adj Adv Pron Num M Prep
 * Conj Aux Intj Prefix Suffix Phonetic`). Pleco prints the part of speech spelled out and
 * upper-cased above the senses (`ADVERB`); a list row has no room for that, so there are two
 * registers here — an abbreviation for the row and the full word for the detail sheet.
 */

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
 * `posPrimary` and the sheet `posLong`.
 */
export function posShort(pos: readonly string[]): string {
	return pos
		.map((code) => SHORT[code] ?? code.toLowerCase())
		.filter(Boolean)
		.join('/');
}

/**
 * `['V','N']` → `v.` — the primary code only, for a list row.
 *
 * The row reserves a fixed column for this so that the 386 words with no annotation at all do
 * not leave the gloss column with a ragged left edge. A reserved column only works if every
 * value fits it, and the joined form does not: `n.` is 1,666 rows and `pron./adv./conj.` is
 * one, so sizing for the worst case would spend a fifth of a 375px row on a label. Every code
 * a word carries is still on the sheet, spelled out — `verb · noun` — one tap away.
 */
export function posPrimary(pos: readonly string[]): string {
	const first = pos[0];
	if (first === undefined) return '';
	return SHORT[first] ?? first.toLowerCase();
}

/** `['V','N']` → `verb · noun`, for the one place there is room to spell it out. */
export function posLong(pos: readonly string[]): string {
	return pos
		.map((code) => LONG[code] ?? code.toLowerCase())
		.filter(Boolean)
		.join(' · ');
}

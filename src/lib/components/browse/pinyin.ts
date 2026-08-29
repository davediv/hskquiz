/**
 * The syllables of a word's printed pinyin, for search to index.
 *
 * `Word.syllables` ships one `{ py, tone }` per hanzi character, built and gate-checked at
 * build time against the reference CEDICT keys. What it deliberately does not carry is the
 * punctuation the official list prints *between* syllables: 314 words are spaced
 * (`bāng máng`), 24 take the syllable apostrophe (`nǚ'ér`), 8 are hyphenated
 * (`qīng-shàonián`), and 谁 prints two readings separated by a slash (`shéi/shuí`).
 *
 * So the two are zipped back together here — each syllable is located in the printed string in
 * order — and anything left between or after them is split on its separators and kept as a
 * syllable of its own. That last part is not pedantry: it is the only reason typing `shui`
 * still finds 谁, whose second reading exists in `pinyin` and nowhere else.
 *
 * Verified over all 4,308 shipped words: every syllable aligns, and the only leftovers are
 * ` `, `'`, `-`, `/shuí` and `/shóu`.
 *
 * Rendering does not come through here. `<Pinyin {word}>` and `<Hanzi {word}>` read
 * `Word.syllables` directly, because a renderer wants the tone and the build's own
 * character-aligned cut, not the printed string's punctuation.
 */

import type { Word } from '$lib/types';

/** Characters the official list uses between syllables, plus the variant-reading slash. */
const SEPARATORS = /[\s'’·∥\-–—/]+/u;

/** The pieces of `text` that are not separators. */
function tokens(text: string): string[] {
	return text.split(SEPARATORS).filter((token) => token !== '');
}

/**
 * Every syllable of `word.pinyin`, in printed order and in its printed (tone-marked) form.
 *
 * Concatenating the result loses only the separators, so it is a faithful basis for the tight
 * `chenghao` form search compares against, and the offsets between consecutive entries are the
 * syllable boundaries a pinyin query is only ever allowed to start on.
 */
export function printedSyllables(word: Pick<Word, 'pinyin' | 'syllables'>): string[] {
	const out: string[] = [];
	let at = 0;

	for (const syllable of word.syllables) {
		const found = word.pinyin.indexOf(syllable.py, at);
		// Defensive: the build gates this, but search must never silently drop half a word.
		if (found < 0) continue;
		if (found > at) out.push(...tokens(word.pinyin.slice(at, found)));
		out.push(syllable.py);
		at = found + syllable.py.length;
	}

	if (at < word.pinyin.length) out.push(...tokens(word.pinyin.slice(at)));
	return out.length > 0 ? out : tokens(word.pinyin);
}

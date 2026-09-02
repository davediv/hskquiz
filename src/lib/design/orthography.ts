/**
 * SENTENCE ORTHOGRAPHY — the pinyin line under an example sentence, set as a sentence.
 *
 * WHAT WAS WRONG. `Word.pinyin` is spelled by word, because the official list spells it that
 * way: 夏天 ships as `xiàtiān`. `Example.pinyin` was not spelled at all — one bare syllable per
 * character, no punctuation:
 *
 *     夏天到了，天气越来越热。   xià tiān dào le tiān qì yuè lái yuè rè
 *
 * so a card printed `xiàtiān` on its headword line and `Xià tiān` in the sentence 25px below
 * it: the same word twice in one viewport, spelled two ways. All 4,308 shipped sentences read
 * that way, and all 479 with a 、or ，threw the comma away.
 *
 * WHAT SETS IT NOW, AND IN WHICH ORDER.
 *
 *   1. THE SOURCE. `scripts/build-vocab.mjs` now spells most of `example.pinyin` by word, and
 *      wherever it writes a join it is kept exactly — every gap, apostrophe and hyphen. This
 *      module never opens a gap the source closed.
 *   2. THE LEXICON, for what the source left open. `lexicon.ts` is the shipped corpus's own
 *      `hanzi` = `pinyin` pairs, so 北边 closes to `běibian` because the list writes it joined,
 *      越来越 stays in three pieces because the list writes `yuè lái yuè`, and 不客气 keeps its
 *      one gap. Every join here was decided by the official list, not by this file.
 *   3. THE HANZI, for what neither can carry: the punctuation. `example.pinyin` is a reading of
 *      characters, not a sentence — it has no comma and no stop, and the only thing that knows
 *      where they go is the hanzi line above. 夏天到了，天气越来越热。 comes out
 *      `Xiàtiān dào le, tiānqì yuè lái yuè rè.`, the comma landing on the syllable 了 sits on.
 *
 * TWO WAYS IN, BECAUSE TWO CALLERS HOLD DIFFERENT THINGS.
 *
 *   · `spellSentence(hanzi, pinyin)` — the strong one, and the one every sentence call site
 *     uses. The characters align 1:1 with the syllables, so the segmentation and the
 *     punctuation are both exact.
 *
 *   · `joinBySound(syllables)` — the weak one, for a caller holding syllables and no string and
 *     no characters. The browse sheet cuts a sentence into headword runs and hands `<Pinyin>`
 *     one run at a time; without this it printed `ài hào` under an entry headed `àihào`. Lookup
 *     is tone-marked, so 有 `yǒu` can never be read as 游 `yóu`.
 *
 * WHAT IT DOES NOT DO: guess. A stretch that is not a word in the list is left exactly as the
 * source wrote it. Under-joining prints a legible reading; over-joining invents a word.
 */

import type { Syllable } from '$lib/types';
import { LONGEST_WORD, wordLike, wordOf, type LexWord } from './lexicon';
import { segmentPinyin, sourceSeparators, type PinyinPart } from './tone';

/**
 * The Latin mark the pinyin line takes for each full-width mark on the hanzi line. Only 。，？！
 * occur in the shipped corpus; the rest are here so a future sentence cannot silently lose one.
 */
const PUNCTUATION: ReadonlyMap<string, string> = new Map([
	['。', '.'],
	['，', ','],
	['、', ','],
	['？', '?'],
	['！', '!'],
	['：', ':'],
	['；', ';'],
	['…', '…'],
	['—', '—'],
	['·', '·']
]);

/** A character that carries a syllable. Punctuation does not. */
const HAN = /\p{Script=Han}/u;

/** One word of the segmentation: how many syllables it covers, and the list's entry for it. */
interface Token {
	length: number;
	word: LexWord | undefined;
}

/**
 * The spelling decided for one reading, as three parallel arrays: what is printed before each
 * syllable, the syllable itself, and what is printed after it.
 */
interface Spelling {
	lead: string[];
	text: string[];
	tail: string[];
}

/**
 * Cut `count` positions into the fewest dictionary words, with `at(start, length)` answering
 * whether a span is one.
 *
 * Fewest tokens is the whole rule — a segmentation that recognises 天气 as one word beats one
 * that reads two characters — and ties break towards the longer word first (`sum of length²`),
 * which is the standard resolution for 研究 + 生命 against 研究生 + 命. Anything the list does
 * not know stays a single syllable, so the worst case is exactly today's output.
 */
function segment(
	count: number,
	at: (start: number, length: number) => LexWord | undefined
): Token[] {
	interface Cut {
		tokens: number;
		weight: number;
		cut: Token[];
	}
	const best: (Cut | null)[] = new Array<Cut | null>(count + 1).fill(null);
	best[count] = { tokens: 0, weight: 0, cut: [] };

	for (let i = count - 1; i >= 0; i -= 1) {
		for (let length = Math.min(LONGEST_WORD, count - i); length >= 1; length -= 1) {
			const word = length === 1 ? undefined : at(i, length);
			if (length > 1 && word === undefined) continue;
			const rest = best[i + length];
			if (rest === null) continue;
			const candidate: Cut = {
				tokens: rest.tokens + 1,
				weight: rest.weight + length * length,
				cut: [{ length, word }, ...rest.cut]
			};
			const current = best[i];
			if (
				current === null ||
				candidate.tokens < current.tokens ||
				(candidate.tokens === current.tokens && candidate.weight > current.weight)
			) {
				best[i] = candidate;
			}
		}
	}
	return best[0]?.cut ?? [];
}

/** Upper-case the first letter of a syllable, leaving a tone mark's identity alone. */
function capitalise(text: string): string {
	const glyphs = [...text];
	const at = glyphs.findIndex((glyph) => glyph.toLowerCase() !== glyph.toUpperCase());
	if (at < 0) return text;
	glyphs[at] = glyphs[at].toUpperCase();
	return glyphs.join('');
}

/**
 * Write one segmented stretch into the spelling: inside each word, the list's own join.
 *
 * It only ever CLOSES a gap. A separator the source already wrote as something other than
 * whitespace — a join, an apostrophe, a hyphen — is left alone, because a source that spelled
 * the word knows something this table does not, and the two agreeing is the normal case now
 * that the build spells `example.pinyin` by word. Proper nouns take the capital the list gives
 * them (北京 `Běijīng`), which no reading of the characters alone can supply.
 */
function closeGaps(spelling: Spelling, tokens: Token[], from: number): void {
	let at = from;
	for (const token of tokens) {
		for (let k = 1; k < token.length; k += 1) {
			if (/\s/u.test(spelling.lead[at + k])) spelling.lead[at + k] = token.word?.joins[k - 1] ?? '';
		}
		if (token.word?.proper === true) spelling.text[at] = capitalise(spelling.text[at]);
		at += token.length;
	}
}

/**
 * Turn a spelling into the runs `<Pinyin>` colours.
 *
 * A bare `r` after another syllable is erhua — a retroflex ending, not a syllable — so it never
 * takes a gap and never takes its own colour, whatever the segmentation decided.
 */
function assemble(syllables: readonly Syllable[], spelling: Spelling): PinyinPart[] {
	return syllables.map((syllable, i) => {
		const erhua = i > 0 && syllable.py === 'r';
		const lead = erhua ? '' : spelling.lead[i];
		return {
			text: `${lead}${spelling.text[i]}${spelling.tail[i]}`,
			tone: erhua ? syllables[i - 1].tone : syllable.tone
		};
	});
}

/** An empty spelling for `syllables`, with every syllable printed as the source wrote it. */
function blank(syllables: readonly Syllable[]): Spelling {
	return {
		lead: syllables.map(() => ' '),
		text: syllables.map((syllable) => syllable.py),
		tail: syllables.map(() => '')
	};
}

/** The hanzi cut at its own punctuation: no word, and no join, ever spans a comma. */
interface Clause {
	chars: string[];
	/** Index of this clause's first syllable in the sentence. */
	from: number;
	/** The Latin punctuation that follows it. */
	after: string;
}

function clauses(hanzi: string): { list: Clause[]; characters: number } {
	const list: Clause[] = [];
	let run: string[] = [];
	let from = 0;
	let seen = 0;
	for (const glyph of [...hanzi]) {
		if (HAN.test(glyph)) {
			if (run.length === 0) from = seen;
			run.push(glyph);
			seen += 1;
			continue;
		}
		const latin = PUNCTUATION.get(glyph);
		if (latin === undefined) continue;
		if (run.length > 0) {
			list.push({ chars: run, from, after: latin });
			run = [];
		} else if (list.length > 0) {
			list[list.length - 1].after += latin;
		}
	}
	if (run.length > 0) list.push({ chars: run, from, after: '' });
	return { list, characters: seen };
}

/**
 * An example sentence's pinyin, set as a sentence: word boundaries closed, the hanzi's own
 * punctuation carried across, a capital at the front.
 *
 * THE SOURCE HAS THE FIRST WORD. `scripts/build-vocab.mjs` now spells most of `example.pinyin`
 * by word, and where it writes a join — `xiàtiān`, `tiānqì` — that join is kept exactly, gaps,
 * apostrophes and all. This function only ever CLOSES a gap the source left open where the
 * lexicon says the two syllables are inside one word, and never opens one the source closed.
 * So a better build makes it do less, not something different.
 *
 * WHAT THE SOURCE CANNOT CARRY is the punctuation: `example.pinyin` has no comma and no stop,
 * because it is a reading of the characters and not a sentence. 夏天到了，天气越来越热。 comes
 * out `Xiàtiān dào le, tiānqì yuè lái yuè rè.` — the comma landing on the syllable the 了 sits
 * on, which is only knowable from the hanzi.
 *
 * Returns `null` when the two lines cannot be aligned — a reading with a different number of
 * syllables than the sentence has characters — so the caller prints the source rather than a
 * confidently mispunctuated line.
 */
export function spellSentence(hanzi: string, pinyin: string): PinyinPart[] | null {
	const syllables = segmentPinyin(pinyin);
	if (syllables.length === 0) return null;

	const { list, characters } = clauses(hanzi);
	if (characters !== syllables.length || list.length === 0) return null;

	// The source's own spelling, kept whole: `seps[i]` is what it writes before syllable `i`.
	const seps = sourceSeparators(pinyin, syllables);
	if (seps === null) return null;

	const spelling: Spelling = {
		lead: syllables.map((_, i) => seps[i]),
		text: syllables.map((syllable) => syllable.py),
		tail: syllables.map((_, i) => (i === syllables.length - 1 ? seps[syllables.length] : ''))
	};

	for (const [index, clause] of list.entries()) {
		const cut = segment(clause.chars.length, (start, length) =>
			wordOf(clause.chars.slice(start, start + length).join(''))
		);
		closeGaps(spelling, cut, clause.from);
		// A clause boundary is a gap whatever the reading says, and the mark hugs the syllable
		// in front of it the way the 。 hugs its character.
		if (index > 0 && !/\s/u.test(spelling.lead[clause.from])) spelling.lead[clause.from] = ' ';
		spelling.tail[clause.from + clause.chars.length - 1] += clause.after;
	}
	spelling.lead[0] = '';
	spelling.text[0] = capitalise(spelling.text[0]);
	return assemble(syllables, spelling);
}

/**
 * A run of syllables spelled by word, for a caller holding no characters.
 *
 * The browse sheet marks the headword inside its own sentence, which means it hands `<Pinyin>`
 * the sentence in pieces — `[ài, hào]` on its own — with no string and no hanzi. Without this
 * the sheet printed `ài hào` directly under a headword line reading `àihào`.
 */
export function joinBySound(syllables: readonly Syllable[]): PinyinPart[] {
	const spelling = blank(syllables);
	spelling.lead[0] = '';
	const cut = segment(syllables.length, (start, length) =>
		wordLike(syllables.slice(start, start + length))
	);
	closeGaps(spelling, cut, 0);
	return assemble(syllables, spelling);
}

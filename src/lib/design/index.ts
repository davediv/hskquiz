/**
 * The design system's shared primitives.
 *
 * The visual language itself lives in `src/routes/layout.css` — read the comment at the top of
 * that file first; it documents every token, the three roles colour plays in this app, and the
 * separate tone-colour family. What is exported here is only the handful of things that could
 * not be expressed as a token: Chinese typography that needs markup (`lang` attributes,
 * per-syllable and per-character spans) and the tone logic behind it.
 *
 *   import { Hanzi, Pinyin } from '$lib/design';
 *
 *   <Hanzi {word} size="prompt" display />
 *   <Pinyin {word} size="xl" />
 *
 * Both take a whole `Word` — that is how they get `syllables`, the build-time array of
 * `{ py, tone }`. `<Pinyin>` paints one colour per syllable off it; `<Hanzi>` sets the
 * characters in ink and leaves tone to the pinyin line, which is the system's one answer to
 * "where does tone colour go" (see THE FOURTH FAMILY in `layout.css`). They still accept the
 * loose `text` / `pinyin` strings; a string-only `<Pinyin>` segments itself via
 * `segmentPinyin`.
 *
 * `<Pinyin>` prints the source string's own spelling — 爱好 is `àihào`, 不客气 `bú kèqì`,
 * 那儿 `nàr`, 方案 `fāng'àn` — because 汉语拼音正词法 sets pinyin by word and `Word.pinyin`
 * already writes it that way. `layoutPinyin` is the function that does it, exported for the
 * few callers that assemble a reading themselves; `sentenceCase` adds the capital and the
 * terminal stop an example sentence's pinyin line needs. See ORTHOGRAPHY in `layout.css`.
 *
 * An EXAMPLE SENTENCE has no such source spelling to print — `Example.pinyin` ships one bare
 * syllable per character and no punctuation — so `orthography.ts` puts the word boundaries
 * back, off `lexicon.ts`, which is the shipped corpus's own hanzi/pinyin pairs. That is what
 * makes a card able to print `xiàtiān` on its headword line and `Xiàtiān` in the sentence
 * below it rather than `Xià tiān`. `spellSentence` is the character-exact path (the caller
 * holds the hanzi); `joinBySound` is for a caller holding syllables alone.
 *
 * `color.ts` is not exported: it is measurement for `palette.spec.ts`, which holds the
 * stylesheet to its own contrast and tone-separation numbers. Nothing renders from it.
 */

export { default as Hanzi } from './Hanzi.svelte';
export { default as Pinyin } from './Pinyin.svelte';
export { LONGEST_WORD, lexiconSize, wordLike, wordOf, type LexWord } from './lexicon';
export { joinBySound, spellSentence } from './orthography';
export {
	layoutPinyin,
	resolveSyllables,
	segmentPinyin,
	sentenceCase,
	sourceSeparators,
	splitPinyin,
	stripTone,
	toneColor,
	toneOf,
	type PinyinPart,
	type Tone
} from './tone';

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
 * `{ py, tone }` that lets every syllable and every character carry its own tone colour. They
 * still accept the loose `text` / `pinyin` strings; a string-only `<Pinyin>` segments itself
 * via `segmentPinyin`, a string-only `<Hanzi>` stays in plain ink.
 */

export { default as Hanzi } from './Hanzi.svelte';
export { default as Pinyin } from './Pinyin.svelte';
export {
	resolveSyllables,
	segmentPinyin,
	splitPinyin,
	stripTone,
	toneColor,
	toneOf,
	type Tone
} from './tone';

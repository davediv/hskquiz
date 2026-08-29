/**
 * The design system's shared primitives.
 *
 * The visual language itself lives in `src/routes/layout.css` — read the comment at the top of
 * that file first; it documents every token and the three roles colour plays in this app. What
 * is exported here is only the handful of things that could not be expressed as a token:
 * Chinese typography that needs markup (`lang` attributes, per-syllable spans) and the tone
 * logic behind it.
 *
 *   import { Hanzi, Pinyin } from '$lib/design';
 */

export { default as Hanzi } from './Hanzi.svelte';
export { default as Pinyin } from './Pinyin.svelte';
export { splitPinyin, stripTone, toneColor, toneOf, type Tone } from './tone';

<!--
	Simplified hanzi, set the way the design system wants it: a real Chinese face, tight leading,
	a hair of tracking so adjacent characters do not knit together, and no synthetic bolding.

	`lang="zh-Hans"` is not decoration — it tells the browser which face to reach for when a
	glyph is shared with Japanese, and it tells a screen reader which voice to use.

	THE CHARACTER IS INK. Pleco colours the hanzi by tone (手机 = blue 手 + red 机) and leaves
	the pinyin black; Du Chinese colours both. This system colours the pinyin only, so `tones`
	defaults to FALSE here and to true in `<Pinyin>`. Two reasons, and they are the same two
	the design-system comment in `layout.css` gives:

	  · the glyph's shape is what the learner is trying to learn, and a saturated hue laid
	    across it at 60–90px competes with the strokes rather than annotating them;
	  · a character carries no tone diacritic, so on hanzi the colour would be the ONLY copy
	    of the tone — exactly the single-channel signal the rest of this system refuses.

	The practical consequence is that 爱 is the same ink in a list row and in the sheet that
	row opens, instead of changing colour when you tap it.

	  <Hanzi {word} size="hero" display />          the headword a screen is built around
	  <Hanzi {word} size="sm" />                    inline in a list row — ink
	  <Hanzi text={w.hanzi} size="sm" />            no tone data needed; ink either way
	  <Hanzi {word} size="lg" tones />              opt IN, for a screen that teaches tone
	                                                itself. Nothing in the app does today.

	Painting still needs one syllable per character — without `syllables`, or with a count that
	does not match (the build makes that impossible for shipped words, but a caller could
	contrive it), `tones` is ignored and the characters render as one plain text node.
-->
<script lang="ts">
	import type { Syllable, Word } from '$lib/types';
	import { toneColor } from './tone';

	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'hero';

	interface Props {
		/** The word to read hanzi and syllables off. Wins over the two loose props. */
		word?: Pick<Word, 'hanzi' | 'syllables'>;
		/** Cleaned simplified hanzi — never the raw `爸爸|爸` source notation. */
		text?: string;
		/** Build-time syllables, one per character. Required for tone colour. */
		syllables?: readonly Syllable[];
		/** Step on the hanzi type scale. Defaults to the list-row size. */
		size?: Size;
		/** Medium weight, for the one headword a screen is about. */
		display?: boolean;
		/**
		 * Opt in to per-character tone colour. Off by default: the system puts tone on the
		 * pinyin. No effect without one `syllables` entry per character.
		 */
		tones?: boolean;
		class?: string;
	}

	let {
		word,
		text,
		syllables,
		size = 'md',
		display = false,
		tones = false,
		class: extra = ''
	}: Props = $props();

	// Written out in full so Tailwind's source scanner finds every class.
	const SIZE_CLASS: Record<Size, string> = {
		xs: 'text-hanzi-xs',
		sm: 'text-hanzi-sm',
		md: 'text-hanzi-md',
		lg: 'text-hanzi-lg',
		hero: 'text-hanzi-hero'
	};

	const characters = $derived(word?.hanzi ?? text ?? '');
	const glyphs = $derived([...characters]);

	/** Only paint when there is exactly one syllable per character — otherwise stay plain ink. */
	const painted = $derived.by(() => {
		const known = word?.syllables ?? syllables;
		if (!tones || known === undefined) return null;
		if (known.length === 0 || known.length !== glyphs.length) return null;
		return glyphs.map((glyph, i) => ({ glyph, color: toneColor(known[i].tone) }));
	});
</script>

<span lang="zh-Hans" class="{display ? 'hanzi-display' : 'hanzi'} {SIZE_CLASS[size]} {extra}"
	>{#if painted}{#each painted as cell, i (i)}<span style:color={cell.color}>{cell.glyph}</span
			>{/each}{:else}{characters}{/if}</span
>

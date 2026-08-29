<!--
	Simplified hanzi, set the way the design system wants it: a real Chinese face, tight leading,
	a hair of tracking so adjacent characters do not knit together, and no synthetic bolding.

	`lang="zh-Hans"` is not decoration — it tells the browser which face to reach for when a
	glyph is shared with Japanese, and it tells a screen reader which voice to use.

	TONE COLOUR ON THE CHARACTER. This is where Pleco puts it — 手机 is a blue 手 and a red 机,
	with the pinyin left plain — and where Du Chinese puts it as well, on both. One character is
	exactly one syllable, so the mapping is not a guess: give this component `syllables` (or the
	whole `word`) and each character is painted from its own tone.

	  <Hanzi {word} size="prompt" display />        the headword a screen is built around
	  <Hanzi {word} size="sm" />                    inline in a list row
	  <Hanzi text={w.hanzi} size="sm" />            no tone data: plain ink, one text node
	  <Hanzi {word} size="lg" tones={false} />      opt out where the surface owns the colour

	Without `syllables` — or if their count does not match the characters, which the build makes
	impossible for shipped words but a caller could still contrive — it renders exactly as it
	always did, in plain ink.
-->
<script lang="ts">
	import type { Syllable, Word } from '$lib/types';
	import { toneColor } from './tone';

	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'prompt' | 'hero';

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
		/** Colour each character by its tone. No effect without matching `syllables`. */
		tones?: boolean;
		class?: string;
	}

	let {
		word,
		text,
		syllables,
		size = 'md',
		display = false,
		tones = true,
		class: extra = ''
	}: Props = $props();

	// Written out in full so Tailwind's source scanner finds every class.
	const SIZE_CLASS: Record<Size, string> = {
		xs: 'text-hanzi-xs',
		sm: 'text-hanzi-sm',
		md: 'text-hanzi-md',
		lg: 'text-hanzi-lg',
		xl: 'text-hanzi-xl',
		'2xl': 'text-hanzi-2xl',
		prompt: 'text-hanzi-prompt',
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

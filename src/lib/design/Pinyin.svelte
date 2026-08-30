<!--
	Tone-marked pinyin, set the way Du Chinese sets it: one syllable per hanzi character, spaced,
	each syllable in its tone's colour. It is the line that tells a learner how the word actually
	sounds, so it gets the whole treatment rather than a flat grey.

	The tones come from `Word.syllables`, which the build derives from the reference CEDICT keys
	and asserts 1:1 against the characters — nothing here guesses. Pass it whenever you have it:

	  <Pinyin {word} size="xl" />                            preferred — word carries both
	  <Pinyin pinyin={w.pinyin} syllables={w.syllables} />    same thing, spelled out
	  <Pinyin pinyin={w.pinyin} size="sm" />                  string only: segmented by tone.ts

	The string-only form is not a downgrade in practice — `segmentPinyin` reproduces the build's
	own syllabification on 4,306 of the 4,308 shipped words (see `tone.spec.ts`) — but the data
	is exact by construction, so prefer it.

	PINYIN IS WHERE TONE COLOUR LIVES — all of it. `<Hanzi>` sets characters in ink, so this
	component is the only place in the app a learner reads tone off a colour. `tones` and
	`spaced` therefore default on, and `tones={false}` is for exactly one situation: pinyin on
	a surface that already owns its colour, such as an ink-filled button, where the tone hues
	would fail contrast. It is NOT a way to set pinyin in a brand colour instead — flat accent
	pinyin was loop 2's landing-page bug, and it reads as "these words are an error".
	Turn `spaced` off to print the official list's own spacing instead of per-syllable spacing:
	不客气 is `bú kèqì` in the data and 回来 is `huí lái`, so unspaced does NOT mean unbroken —
	it means the gaps the list itself writes, and only those. (Joining every syllable printed
	`búkèqì` and `huílái`, which is not how 汉语拼音正词法 writes either word. 135 of the 1,270
	words at HSK 1–2 carry a word-internal space.)

	ERHUA IS THE ONE EXCEPTION TO ONE-SPACE-PER-CHARACTER. 儿 in 那儿 / 面条儿 is a retroflex
	ending on the syllable before it, not a syllable of its own: 汉语拼音正词法 writes nàr and
	miàntiáor, and `Word.pinyin` ships exactly that. Spacing it out as `nà r` printed a reading
	no learner should copy, on the largest type on the summary screen. 36 of the 4,308 shipped
	words carry a bare `r` syllable and every one of them is word-final.
-->
<script lang="ts">
	import type { Syllable, Word } from '$lib/types';
	import { resolveSyllables, toneColor } from './tone';

	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	interface Props {
		/** The word to read pinyin and syllables off. Wins over the two loose props. */
		word?: Pick<Word, 'pinyin' | 'syllables'>;
		/** Tone-marked pinyin, e.g. `bāng máng`. */
		pinyin?: string;
		/** Build-time syllables, one per hanzi character. Authoritative when present. */
		syllables?: readonly Syllable[];
		/** Step on the pinyin type scale. */
		size?: Size;
		/**
		 * Colour each syllable by its tone: 1 vermilion, 2 leaf, 3 blue, 4 violet, 0 slate.
		 * On by default — turn it off only where the surface owns its colour.
		 */
		tones?: boolean;
		/** Put a space between syllables, the way Du Chinese does. */
		spaced?: boolean;
		class?: string;
	}

	let {
		word,
		pinyin,
		syllables,
		size = 'md',
		tones = true,
		spaced = true,
		class: extra = ''
	}: Props = $props();

	// Written out in full so Tailwind's source scanner finds every class.
	const SIZE_CLASS: Record<Size, string> = {
		xs: 'text-pinyin-xs',
		sm: 'text-pinyin-sm',
		md: 'text-pinyin-md',
		lg: 'text-pinyin-lg',
		xl: 'text-pinyin-xl'
	};

	/** A bare `r` is erhua: it belongs to the syllable before it, unspaced and in its colour. */
	function isErhua(py: string, i: number): boolean {
		return i > 0 && py === 'r';
	}

	/**
	 * Which syllables the source string itself writes a space in front of — the `spaced={false}`
	 * answer to "where do the gaps go".
	 *
	 * The syllables are substrings of the source in order, so walking the source and looking at
	 * what sits between two consecutive matches is exact. If a syllable cannot be found (a
	 * hand-built `syllables` array that does not spell the string it was passed with), every gap
	 * is dropped, which is the joined reading this used to print unconditionally: never worse
	 * than before, and no invented spacing.
	 */
	function officialGaps(source: string, list: readonly Syllable[]): boolean[] {
		const gaps = list.map(() => false);
		let at = 0;
		for (let i = 0; i < list.length; i += 1) {
			const found = source.indexOf(list[i].py, at);
			if (found < 0) return list.map(() => false);
			gaps[i] = i > 0 && /\s/.test(source.slice(at, found));
			at = found + list[i].py.length;
		}
		return gaps;
	}

	const parts = $derived.by(() => {
		const source = word?.pinyin ?? pinyin ?? '';
		const list = resolveSyllables(word?.syllables ?? syllables, source);
		const official = spaced ? null : officialGaps(source, list);
		return list.map((syllable, i) => {
			const gap = official ? official[i] : i > 0 && !isErhua(syllable.py, i);
			return {
				// The separator lives inside the span so that copying the pinyin still yields real
				// spaces — a CSS margin would look identical and paste as `zhōngguó`.
				text: gap ? ` ${syllable.py}` : syllable.py,
				color: tones
					? toneColor(isErhua(syllable.py, i) ? list[i - 1].tone : syllable.tone)
					: undefined
			};
		});
	});
</script>

<span lang="zh-Latn-pinyin" class="pinyin {SIZE_CLASS[size]} {extra}"
	>{#each parts as part, i (i)}<span style:color={part.color}>{part.text}</span>{/each}</span
>

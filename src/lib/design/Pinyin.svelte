<!--
	Tone-marked pinyin, set in the orthography the data ships and coloured one hue per tone.
	It is the line that tells a learner how the word actually sounds, so it gets the whole
	treatment rather than a flat grey.

	The tones come from `Word.syllables`, which the build derives from the reference CEDICT keys
	and asserts 1:1 against the characters — nothing here guesses. Pass it whenever you have it:

	  <Pinyin {word} size="xl" />                            preferred — word carries both
	  <Pinyin pinyin={w.pinyin} syllables={w.syllables} />    same thing, spelled out
	  <Pinyin pinyin={w.pinyin} size="sm" />                  string only: segmented by tone.ts

	The string-only form is not a downgrade in practice — `segmentPinyin` reproduces the build's
	own syllabification on 4,306 of the 4,308 shipped words (see `tone.spec.ts`) — but the data
	is exact by construction, so prefer it.

	PINYIN IS WHERE TONE COLOUR LIVES — all of it. `<Hanzi>` sets characters in ink, so this
	component is the only place in the app a learner reads tone off a colour. `tones` therefore
	defaults on, and `tones={false}` is for exactly one situation: pinyin on a surface that
	already owns its colour, such as an ink-filled button, where the tone hues would fail
	contrast. It is NOT a way to set pinyin in a brand colour instead — flat accent pinyin was
	loop 2's landing-page bug, and it reads as "these words are an error".

	IT PRINTS THE SOURCE STRING, EXACTLY. Colouring per syllable means slicing `Word.pinyin`
	apart, and how it is put back together is spelling, not styling. 汉语拼音正词法 sets pinyin
	by word: 爱好 is `àihào`, 北京 `Běijīng`, 不客气 `bú kèqì`, 那儿 `nàr`, 方案 `fāng'àn`,
	五颜六色 `wǔyán-liùsè`. The gaps, apostrophes and hyphens in that string are the official
	list's own and this component keeps every one of them and invents none: the concatenation of
	the rendered spans IS `Word.pinyin`, asserted over all 4,308 shipped words in
	`pinyin.spec.ts`. Re-joining with one space per syllable instead — the old default — printed
	`ài hào`, `Běi jīng` and `nà r` on 3,095 of them (71.8%), and silently dropped the 24
	apostrophes that are the only thing separating `fāngàn` from `fāng'àn`.

	`spaced` forces that other reading back on, and has exactly one use: RUBY, where each
	syllable is positioned over its own character and the gaps are the layout rather than the
	spelling. It is also what happens automatically when a caller passes `syllables` with no
	string to read them out of, because then there is no orthography to preserve.

	`sentence` is the third reading: a leading capital and the terminal stop the hanzi writes,
	for the pinyin line under an example sentence. Pleco sets `Tā jīhū yī yè méi shuì.` under
	他几乎一夜没睡。 — a sentence, not a list of syllables.
-->
<script lang="ts">
	import type { Syllable, Word } from '$lib/types';
	import { layoutPinyin, resolveSyllables, sentenceCase, toneColor } from './tone';

	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	interface Props {
		/** The word to read pinyin and syllables off. Wins over the two loose props. */
		word?: Pick<Word, 'pinyin' | 'syllables'>;
		/** Tone-marked pinyin, e.g. `bāngmáng`. Printed with its own spacing, unchanged. */
		pinyin?: string;
		/** Build-time syllables, one per hanzi character. Authoritative when present. */
		syllables?: readonly Syllable[];
		/** Step on the pinyin type scale. */
		size?: Size;
		/**
		 * Colour each syllable by its tone: 1 vermilion, 2 leaf, 3 blue, 4 violet, 0 petrol.
		 * On by default — turn it off only where the surface owns its colour.
		 */
		tones?: boolean;
		/**
		 * Force one gap per syllable instead of the source's own spelling. Ruby only: use it
		 * where each syllable sits over its own character. Anywhere else it misspells the word.
		 */
		spaced?: boolean;
		/**
		 * Set this reading as a sentence: leading capital, terminal stop. Pass the sentence's
		 * hanzi and the stop matches its punctuation (。 → `.`, ？ → `?`); pass `true` for a
		 * plain full stop.
		 */
		sentence?: string | boolean;
		class?: string;
	}

	let {
		word,
		pinyin,
		syllables,
		size = 'md',
		tones = true,
		spaced = false,
		sentence = false,
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

	const parts = $derived.by(() => {
		const source = word?.pinyin ?? pinyin ?? '';
		const list = resolveSyllables(word?.syllables ?? syllables, source);
		// The separator lives inside the span so that copying the pinyin still yields the real
		// string — a CSS margin would look identical and paste as `zhōngguó` either way.
		const run = layoutPinyin(source, list, spaced);
		const set =
			sentence === false ? run : sentenceCase(run, sentence === true ? undefined : sentence);
		return set.map((part) => ({
			text: part.text,
			color: tones ? toneColor(part.tone) : undefined
		}));
	});
</script>

<span lang="zh-Latn-pinyin" class="pinyin {SIZE_CLASS[size]} {extra}"
	>{#each parts as part, i (i)}<span style:color={part.color}>{part.text}</span>{/each}</span
>

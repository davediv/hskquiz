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

	`sentence` is the third reading, and it is a different job from the other two. `Word.pinyin`
	arrives already spelled; `Example.pinyin` arrives NOT spelled — one bare syllable per
	character, no capital, no punctuation (`xià tiān dào le tiān qì yuè lái yuè rè`) under a
	hanzi line reading 夏天到了，天气越来越热。 So there is nothing to preserve and everything to
	set: pass the sentence's hanzi and `orthography.ts` spells it by word off the shipped word
	list and maps the hanzi's own 。，？！ onto the line — `Xiàtiān dào le, tiānqì yuè lái yuè rè.`
	Pass `true` instead and it gets the capital and a full stop only, because without the
	characters there is no way to know where the words are.

	The same lack of a source is what a caller passing `syllables` and no string has, and it is
	not always ruby: the browse sheet cuts a sentence into headword runs and hands over one run
	at a time. That case used to print one gap per syllable — `ài hào` directly under a headword
	line reading `àihào` — and now goes through the word list too, by sound.
-->
<script lang="ts">
	import type { Syllable, Word } from '$lib/types';
	import { joinBySound, spellSentence } from './orthography';
	import {
		layoutPinyin,
		resolveSyllables,
		sentenceCase,
		sourceSeparators,
		toneColor,
		type PinyinPart
	} from './tone';

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

	/** The capital and terminal stop a sentence reading needs, once the words are laid out. */
	function asSentence(run: PinyinPart[]): PinyinPart[] {
		if (sentence === false) return run;
		return sentenceCase(run, sentence === true ? undefined : sentence);
	}

	/**
	 * The four readings, in the order they claim a call. Ruby first, because there the gaps are
	 * the layout; then a sentence whose characters we hold, which is the only case where word
	 * boundaries can be recovered exactly; then syllables with no string to read them out of,
	 * where the word list is all there is; then the ordinary word, whose source string already
	 * carries the official spelling and is printed unchanged.
	 */
	function spell(source: string, list: Syllable[]): PinyinPart[] {
		if (spaced) return asSentence(layoutPinyin(source, list, true));
		if (typeof sentence === 'string') {
			const spelled = spellSentence(sentence, source);
			if (spelled !== null) return spelled;
		}
		if (list.length > 1 && sourceSeparators(source, list) === null) {
			return asSentence(joinBySound(list));
		}
		return asSentence(layoutPinyin(source, list, false));
	}

	const parts = $derived.by(() => {
		const source = word?.pinyin ?? pinyin ?? '';
		const list = resolveSyllables(word?.syllables ?? syllables, source);
		// The separator lives inside the span so that copying the pinyin still yields the real
		// string — a CSS margin would look identical and paste as `zhōngguó` either way.
		return spell(source, list).map((part) => ({
			text: part.text,
			color: tones ? toneColor(part.tone) : undefined
		}));
	});
</script>

<span lang="zh-Latn-pinyin" class="pinyin {SIZE_CLASS[size]} {extra}"
	>{#each parts as part, i (i)}<span style:color={part.color}>{part.text}</span>{/each}</span
>

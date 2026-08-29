<!--
	Tone-marked pinyin on its own line, with its own weight — the thing Pleco and Du Chinese both
	give a whole line to, and the reason the pinyin font stack leads with Chinese faces (they are
	the ones that carry ǎ ě ǐ ǒ ǔ ǚ in the same face as the unmarked letters).

	`tones` opts into Pleco's tone colouring. It only colours a syllable it is certain of — see
	`tone.ts` — so an unspaced compound stays plain rather than being coloured wrongly.

	  <Pinyin pinyin={word.pinyin} size="xl" />
	  <Pinyin pinyin={word.pinyin} size="sm" tones />
-->
<script lang="ts">
	import { splitPinyin, toneColor, toneOf } from './tone';

	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	interface Props {
		/** Tone-marked pinyin, e.g. `bāng máng`. */
		pinyin: string;
		/** Step on the pinyin type scale. */
		size?: Size;
		/** Colour each syllable by its tone (1 red, 2 green, 3 blue, 4 purple, 5 grey). */
		tones?: boolean;
		class?: string;
	}

	let { pinyin, size = 'md', tones = false, class: extra = '' }: Props = $props();

	// Written out in full so Tailwind's source scanner finds every class.
	const SIZE_CLASS: Record<Size, string> = {
		xs: 'text-pinyin-xs',
		sm: 'text-pinyin-sm',
		md: 'text-pinyin-md',
		lg: 'text-pinyin-lg',
		xl: 'text-pinyin-xl'
	};

	// The separator lives inside the span so that copying the pinyin still yields real spaces —
	// a CSS margin would look identical and paste as `zhōngguó`.
	const syllables = $derived(
		splitPinyin(pinyin).map((syllable, i) => ({
			text: i === 0 ? syllable : ` ${syllable}`,
			color: toneColor(toneOf(syllable))
		}))
	);
</script>

<span lang="zh-Latn-pinyin" class="pinyin {SIZE_CLASS[size]} {extra}"
	>{#if tones}{#each syllables as syllable, i (i)}<span style:color={syllable.color}
				>{syllable.text}</span
			>{/each}{:else}{pinyin}{/if}</span
>

<!--
	Simplified hanzi, set the way the design system wants it: a real Chinese face, tight leading,
	a hair of tracking so adjacent characters do not knit together, and no synthetic bolding.

	`lang="zh-Hans"` is not decoration — it tells the browser which face to reach for when a
	glyph is shared with Japanese, and it tells a screen reader which voice to use.

	  <Hanzi text={word.hanzi} size="prompt" />          the headword a screen is built around
	  <Hanzi text={word.hanzi} size="sm" />              inline in a list row
-->
<script lang="ts">
	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'prompt' | 'hero';

	interface Props {
		/** Cleaned simplified hanzi — never the raw `爸爸|爸` source notation. */
		text: string;
		/** Step on the hanzi type scale. Defaults to the list-row size. */
		size?: Size;
		/** Medium weight, for the one headword a screen is about. */
		display?: boolean;
		class?: string;
	}

	let { text, size = 'md', display = false, class: extra = '' }: Props = $props();

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
</script>

<span lang="zh-Hans" class="{display ? 'hanzi-display' : 'hanzi'} {SIZE_CLASS[size]} {extra}"
	>{text}</span
>

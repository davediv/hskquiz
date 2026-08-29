<!--
	One answer. Four of these are the whole interaction, so they get the bottom of the screen.

	NOTHING IS EVER ADDED TO THIS BUTTON. It holds one line, it is the same height answered and
	unanswered, and the ✓/✕ is absolutely positioned so even that costs no layout. It used to
	grow a second line — 看 `kàn`, what you actually picked — on the tap, which moved every
	button below it down by up to 45px (so a fast second tap landed on a different word than the
	one under the thumb) and pushed the continue button off the bottom of a 667px phone. That
	line still exists; it moved to the reveal above, where the stage absorbs its height instead
	of the page. Reserving it here would have cost 24px of empty row on all four buttons, on
	every question, for something that shows on at most one of them and only after the tap.

	Feedback is never colour alone: the picked button carries a ✕ or a ✓ glyph, the right answer
	carries a ✓ whether or not it was picked, and the verdict is spelled out in words above.

	THE OTHER TWO ANSWERS ARE STILL WORDS. They used to be `opacity: 0.42`, which put `dry` at
	2.72:1 on its own button — under the 4.5:1 floor, and faintest for the learner who most
	needs to read it. De-emphasis is now a colour and a surface (`--color-ink-muted` on
	`--color-page`, ~8:1), which reads as quieter without erasing three glosses the learner is
	about to meet.

	NO TONE COLOUR ON THE FACES. A control's colour is its state — right, wrong, quiet — and
	four tone-painted characters would be a fifth signal competing with that. Tone lives on the
	headword above, where it is the answer rather than an option.
-->
<script lang="ts">
	import type { Direction, Word } from '$lib/types';
	import { Hanzi } from '$lib/design';
	import { primaryGloss, type ChoiceStatus } from './quiz';

	interface Props {
		word: Word;
		direction: Direction;
		/** Zero-based position, for the `1`–`4` keyboard badge. */
		index: number;
		status: ChoiceStatus;
		onpick: () => void;
	}

	let { word, direction, index, status, onpick }: Props = $props();

	const isHanzi = $derived(direction === 'meaning-to-hanzi');
	const marker = $derived(
		status === 'chosen-wrong' ? 'cross' : status === 'idle' || status === 'other' ? null : 'check'
	);
	const label = $derived(isHanzi ? word.hanzi : primaryGloss(word));
	/**
	 * The 111 glosses long enough to wrap in a 257px label. A step down keeps them on one line
	 * — `makes a sentence a yes-no question` measures 275px at 16px and 241px at 14px — which
	 * matters because a wrapped button is a taller button, and all four grow with it.
	 */
	const long = $derived(!isHanzi && label.length > 28);
</script>

<button
	type="button"
	class="choice"
	class:right={status === 'chosen-right'}
	class:miss={status === 'chosen-wrong'}
	class:answer={status === 'answer'}
	class:muted={status === 'other'}
	class:long
	disabled={status !== 'idle'}
	aria-label={isHanzi ? `Character ${label}` : label}
	onclick={onpick}
>
	{#if marker === 'check'}
		<span class="badge glyph" class:solid={status === 'chosen-right'} aria-hidden="true">
			<svg viewBox="0 0 16 16" focusable="false">
				<path
					d="m3.5 8.5 3 3 6-7"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</span>
	{:else if marker === 'cross'}
		<span class="badge glyph solid" aria-hidden="true">
			<svg viewBox="0 0 16 16" focusable="false">
				<path
					d="m4.5 4.5 7 7m0-7-7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
				/>
			</svg>
		</span>
	{:else}
		<span class="badge key tabular" aria-hidden="true">{index + 1}</span>
	{/if}

	{#if isHanzi}
		<Hanzi text={word.hanzi} tones={false} class="glyph-face" />
	{:else}
		<span class="gloss">{label}</span>
	{/if}
</button>

<style>
	/*
	 * The height comes from the viewport, not the width: 568px is the phone this has to fit
	 * and 932px the one it should fill. It is a `clamp` on `svh` rather than a step at a
	 * breakpoint because the stage above is whatever is left over — 46px pills at 592px of
	 * viewport and 64px pills at 593px meant the headword had 40px of room on one side of
	 * that line and 110px on the other. The floor is 46px, over the 44px tap minimum; the
	 * ceiling is 72px, past which a pill holding one word is just a slab.
	 *
	 * `block-size: 100%` lets the `.answers` grid equalise all four when one gloss wraps, so
	 * the stack stays a stack.
	 */
	.choice {
		--choice-h: clamp(2.875rem, calc(7.38svh + 4.1px), 4.5rem);
		--choice-face: clamp(1.625rem, calc(4.1svh + 2.7px), 2.5rem);

		position: relative;
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: 100%;
		min-block-size: var(--choice-h);
		/*
		 * 2.125rem is the 22px ✓/✕ badge, its 10px inset and 2px to spare — no more, because
		 * every pixel of it is taken off the label on both sides and a label that wraps is a
		 * taller button, and four taller buttons come out of the headword above. It was 3rem
		 * when part of the reservation was for a keyboard number that is `display: none` on
		 * every touch device, then 2.375rem; the longest shipped gloss — `makes a sentence a
		 * yes-no question` — has gained 30px of line across the two moves.
		 */
		padding: 0.5rem 2.125rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		color: var(--color-ink);
		text-align: center;
		transition:
			background-color 140ms var(--ease-out-soft),
			border-color 140ms var(--ease-out-soft),
			box-shadow 140ms var(--ease-out-soft),
			color 180ms var(--ease-out-soft),
			transform 110ms var(--ease-out-soft);
	}

	.choice:not(:disabled):active {
		transform: scale(0.985);
		background-color: var(--color-surface-sunken);
	}

	@media (hover: hover) {
		.choice:not(:disabled):hover {
			border-color: var(--color-ink-muted);
			box-shadow: var(--shadow-card);
		}
	}

	.choice:disabled {
		cursor: default;
	}

	/* Emphasis is drawn as an inset ring rather than a thicker border, so nothing reflows the
	   instant an answer lands. */
	.choice.right,
	.choice.answer {
		border-color: var(--color-correct);
		background-color: var(--color-correct-soft);
		box-shadow: inset 0 0 0 1px var(--color-correct);
	}

	.choice.miss {
		border-color: var(--color-wrong);
		background-color: var(--color-wrong-soft);
		box-shadow: inset 0 0 0 1px var(--color-wrong);
		animation: var(--animate-shake);
	}

	/*
	 * Quieter, not fainter — see the note at the top of the file. The border is a mix rather
	 * than `--color-line`, which sat at ~1.05:1 on the page and made these read as holes in
	 * the stack rather than as the two answers they still are. 70% of the strong line lands at
	 * 2.3:1 — a clear step down from the 3.36:1 of a live button, still plainly a pill.
	 */
	.choice.muted {
		border-color: color-mix(in srgb, var(--color-line-strong) 70%, var(--color-page));
		background-color: var(--color-page);
		color: var(--color-ink-muted);
	}

	.badge {
		position: absolute;
		inset-inline-start: 0.625rem;
		inset-block-start: 50%;
		translate: 0 -50%;
		display: grid;
		place-items: center;
		inline-size: 1.375rem;
		block-size: 1.375rem;
		border-radius: var(--radius-pill);
	}

	/* The number is a keyboard affordance, so it only shows where there is a keyboard. */
	.key {
		display: none;
		border: 1px solid var(--color-line);
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	@media (hover: hover) and (pointer: fine) {
		.key {
			display: grid;
		}
	}

	.glyph svg {
		inline-size: 0.9375rem;
		block-size: 0.9375rem;
	}

	.choice.answer .glyph {
		color: var(--color-correct);
	}

	.glyph.solid {
		color: var(--color-correct-ink);
		background-color: var(--color-correct);
	}

	.choice.miss .glyph.solid {
		color: var(--color-wrong-ink);
		background-color: var(--color-wrong);
	}

	.long .gloss {
		font-size: var(--text-sm);
	}

	.gloss {
		font-size: var(--text-base);
		font-weight: 600;
		line-height: 1.3;
		text-wrap: balance;
	}

	/*
	 * A 320px phone left 212px of label between the two badge insets, and `turns a word into
	 * an adverb` is 207px at 16px — so on the narrowest screen a third of the shipped glosses
	 * wrapped, all four pills grew 16px with the one that did, and 64px came out of the stage
	 * above. That is where 地 lost its headword to the 2.5rem floor and printed on top of its
	 * own pinyin. One step down on each rung, plus 12px of the padding back at 320 itself,
	 * keeps all 4,316 of them on one line: the longest — `makes a sentence a yes-no question`
	 * — measures 210px at 12px against 224px of room, and it is the only one over 208.
	 */
	@media (max-width: 22.5rem) {
		.gloss {
			font-size: var(--text-sm);
		}

		.long .gloss {
			font-size: var(--text-xs);
		}
	}

	@media (max-width: 20.5rem) {
		.choice {
			/* The badge is absolutely positioned and the label is centred, so the two only meet
			   if a label fills the box: the widest one starts at 35px, past the badge's 32px. */
			padding-inline: 1.75rem;
		}
	}

	/* :global — the span belongs to `<Hanzi>`, and this has to beat its size utility. */
	.choice :global(.glyph-face) {
		font-size: var(--choice-face);
		line-height: 1.1;
	}
</style>

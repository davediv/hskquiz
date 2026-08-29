<!--
	One word in the browse list.

	Modelled on Pleco's search results rather than a card: hanzi first and large, tone-marked
	pinyin trailing it on the same baseline, the meaning on a second line behind its part of
	speech, and a hairline instead of a border. Cards would put 1px of chrome and 8px of gap
	around every one of a thousand rows; a hairline list reads as one continuous thing you can
	run your eye down, which is what browsing a word list actually is.

	The row is a fixed height on purpose — that is what lets the list window itself (see
	`virtual.ts`), so the meaning is clamped to one line and the whole entry lives in the sheet
	a tap away. The height is read back off this element at runtime, so it is defined once in
	CSS and never duplicated in TypeScript.
-->
<script lang="ts">
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Word } from '$lib/types';
	import { posShort } from './pos';
	import StatusPip from './StatusPip.svelte';
	import { STATUS_META, type WordStatus } from './status';

	interface Props {
		word: Word;
		status: WordStatus;
		/** Index in the filtered list — the anchor for keyboard navigation and scrolling. */
		index: number;
		/** Length of the filtered list, so a screen reader can announce "12 of 1,071". */
		total: number;
		onopen: (index: number) => void;
	}

	let { word, status, index, total, onopen }: Props = $props();

	const pos = $derived(posShort(word.pos));
	const gloss = $derived(word.meanings.join(', '));
</script>

<!--
	The list is windowed, so only ~18 of a thousand rows are ever in the DOM. Left alone a screen
	reader would announce "list, 18 items" and no position at all, which is worse than useless on
	a list you are scrolling through. `aria-setsize`/`aria-posinset` are the fix — but ARIA does
	not support them on `button` (browsers drop them silently), so the row is a `listitem`
	carrying the position, with the button inside it. The parent sets `role="list"`.
-->
<div class="item" role="listitem" aria-setsize={total} aria-posinset={index + 1}>
	<button type="button" class="row" data-index={index} onclick={() => onopen(index)}>
		<span class="body">
			<span class="head">
				<Hanzi text={word.hanzi} size="sm" class="hz" />
				<Pinyin pinyin={word.pinyin} size="md" tones class="py" />
			</span>
			<span class="gloss">
				{#if pos}<span class="pos">{pos}</span>{/if}{gloss}
			</span>
		</span>

		<StatusPip {status} />
		<!-- Position is not repeated here: `aria-posinset` above already says "784 of 1,070". -->
		<span class="sr-only">{STATUS_META[status].description}</span>
	</button>
</div>

<style>
	/* The listitem wrapper is the grid item; it adds no box of its own, so the windowing maths
	   (which measures the button) still describes the height of the whole row. */
	.item {
		min-inline-size: 0;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 0.75rem;
		inline-size: 100%;
		block-size: var(--browse-row-h);
		padding-inline: 0.25rem;
		border: 0;
		border-block-end: 1px solid var(--color-line);
		background: none;
		text-align: start;
		/* The sticky controls overlap the list, so keyboard focus has to clear them. */
		scroll-margin-block-start: var(--browse-sticky-h);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-inline-size: 0;
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-inline-size: 0;
	}

	/* Hanzi keeps its size; if anything has to give on a narrow screen it is the pinyin. */
	.head :global(.hz) {
		flex: none;
		color: var(--color-ink);
	}

	.head :global(.py) {
		min-inline-size: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--color-ink-muted);
	}

	.gloss {
		overflow: hidden;
		color: var(--color-ink-muted);
		font-size: var(--text-sm);
		line-height: 1.45;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.pos {
		margin-inline-end: 0.375rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
		font-style: italic;
		font-variant: small-caps;
	}

	.row:active {
		background-color: var(--color-surface-sunken);
	}

	@media (hover: hover) {
		.row:hover {
			background-color: var(--color-surface-sunken);
		}
	}
</style>

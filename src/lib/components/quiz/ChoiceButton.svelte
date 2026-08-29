<!--
	One answer. Four of these are the whole interaction, so they get the bottom of the screen
	and a target no smaller than 56px — 68px when the face of the button is a character, which
	needs the optical size to be legible at all.

	Feedback is never colour alone: the picked button carries a ✕ or a ✓ glyph, the right answer
	carries a ✓ whether or not it was picked, and the verdict is spelled out in words above.

	A missed pick also shows what the learner actually chose — 看 `kàn`, "to look" — because the
	wrong answer is a word they are about to meet anyway, and that half-second is the only time
	they will ever be curious about it.
-->
<script lang="ts">
	import type { Direction, Word } from '$lib/types';
	import { Hanzi, Pinyin } from '$lib/design';
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
</script>

<button
	type="button"
	class="choice"
	class:hanzi-face={isHanzi}
	class:right={status === 'chosen-right'}
	class:miss={status === 'chosen-wrong'}
	class:answer={status === 'answer'}
	class:muted={status === 'other'}
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

	<span class="body">
		{#if isHanzi}
			<Hanzi text={word.hanzi} size="lg" display />
		{:else}
			<span class="gloss">{label}</span>
		{/if}

		{#if status === 'chosen-wrong'}
			<span class="complement">
				{#if isHanzi}
					<Pinyin pinyin={word.pinyin} size="sm" /> · {primaryGloss(word)}
				{:else}
					<Hanzi text={word.hanzi} size="xs" /> <Pinyin pinyin={word.pinyin} size="sm" />
				{/if}
			</span>
		{/if}
	</span>
</button>

<style>
	.choice {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
		inline-size: 100%;
		min-block-size: 3.5rem;
		padding: 0.75rem 3rem;
		border: 1px solid var(--color-line-strong);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		color: var(--color-ink);
		text-align: center;
		transition:
			background-color 140ms var(--ease-out-soft),
			border-color 140ms var(--ease-out-soft),
			box-shadow 140ms var(--ease-out-soft),
			opacity 180ms var(--ease-out-soft),
			transform 110ms var(--ease-out-soft);
	}

	.choice.hanzi-face {
		min-block-size: 4.25rem;
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

	.choice.muted {
		border-color: var(--color-line);
		opacity: 0.42;
	}

	.badge {
		position: absolute;
		inset-inline-start: 0.75rem;
		inset-block-start: 50%;
		translate: 0 -50%;
		display: grid;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
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
		inline-size: 1rem;
		block-size: 1rem;
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

	.body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-inline-size: 0;
	}

	.gloss {
		font-size: var(--text-base);
		font-weight: 600;
		line-height: 1.3;
		text-wrap: pretty;
	}

	.complement {
		display: inline-flex;
		align-items: baseline;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem;
		color: var(--color-ink-muted);
		font-size: var(--text-xs);
	}
</style>

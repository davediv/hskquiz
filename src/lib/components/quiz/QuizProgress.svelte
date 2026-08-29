<!--
	Where you are in the run, in one strip.

	Du Chinese puts a segmented bar across the top of a flashcard session and it is the right
	call: ten segments say "ten questions", how many are behind you, and how they went — all
	without a number to read. The bar is decorative, though, so the same facts are given as
	text beside it (`3/10`, `✓ 2`, `✕ 1`), which is what keeps the run legible to a screen
	reader and to anyone who cannot separate the jade from the red.
-->
<script lang="ts">
	import type { Mark } from './quiz';

	interface Props {
		/** One entry per question, in order. */
		marks: Mark[];
		/** Zero-based index of the question on screen. */
		index: number;
		correct: number;
		wrong: number;
	}

	let { marks, index, correct, wrong }: Props = $props();

	const total = $derived(marks.length);
	const shown = $derived(Math.min(index + 1, Math.max(total, 1)));
	const answered = $derived(correct + wrong);
</script>

<div class="wrap">
	<p class="row tabular">
		<span class="count">
			<span class="sr-only">Question </span><b>{shown}</b><span class="of">/{total}</span>
		</span>

		{#if answered > 0}
			<span class="scores">
				<span class="score hit">
					<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path
							d="m3.5 8.5 3 3 6-7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>{correct}<span class="sr-only"> correct</span>
				</span>
				{#if wrong > 0}
					<span class="score miss">
						<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
							<path
								d="m4.5 4.5 7 7m0-7-7 7"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
							/>
						</svg>{wrong}<span class="sr-only"> missed</span>
					</span>
				{/if}
			</span>
		{/if}
	</p>

	<div class="rail" aria-hidden="true">
		{#each marks as mark, i (i)}
			<span
				class="seg"
				class:correct={mark === 'correct'}
				class:wrong={mark === 'wrong'}
				class:current={mark === 'current'}
			></span>
		{/each}
	</div>
</div>

<style>
	/*
	 * Fixed height, and `flex: none` inside the run: this is one of the three rows the quiz
	 * column subtracts from the viewport before it hands the rest to the question, so it must
	 * not be a variable. On a 667px phone it costs 48px; from 704px up, 58px.
	 */
	.wrap {
		position: sticky;
		/* Rides the shell's live chrome — safe-area inset plus however much bar is on screen. */
		inset-block-start: var(--app-chrome-h, 0px);
		z-index: 20;
		flex: none;
		padding-block: 0.5rem;
		background-color: var(--color-page);
	}

	@media (min-height: 44rem) {
		.wrap {
			padding-block: 0.75rem;
		}
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 0 0.4375rem;
		font-size: var(--text-xs);
		color: var(--color-ink-subtle);
	}

	.count b {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-ink);
	}

	.of {
		opacity: 0.75;
	}

	.scores {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		font-weight: 600;
	}

	.score {
		display: inline-flex;
		align-items: center;
		gap: 0.1875rem;
	}

	.score svg {
		inline-size: 0.8125rem;
		block-size: 0.8125rem;
	}

	.hit {
		color: var(--color-correct);
	}

	.miss {
		color: var(--color-wrong);
	}

	.rail {
		display: flex;
		gap: 0.1875rem;
	}

	.seg {
		flex: 1 1 0;
		block-size: 0.375rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-surface-sunken);
		transition: background-color 220ms var(--ease-out-soft);
	}

	.seg.current {
		background-color: var(--color-ink);
	}

	.seg.correct {
		background-color: var(--color-correct);
	}

	.seg.wrong {
		background-color: var(--color-wrong);
	}

	@media (prefers-contrast: more) {
		.seg {
			outline: 1px solid var(--color-line-strong);
			outline-offset: -1px;
		}
	}
</style>

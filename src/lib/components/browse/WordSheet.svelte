<!--
	One word, opened out of the list.

	The list row is deliberately one line of meaning — that is what lets a thousand of them
	window — so this is where the whole entry lives, and it is modelled directly on Pleco's
	entry screen: hanzi first and large, tone-marked pinyin on its own line under it, the part
	of speech spelled out in a small grey label, then the senses at reading size. Each step down
	that order gets less weight and more air than the one below it, which is the entire reason
	Pleco's entry is scannable at arm's length.

	What Pleco has no reason to show, and this app does, is the last block: what the learner has
	actually done with this word. Browsing and practising are the same product, so the sheet
	that shows you 迷人 also shows you that you have missed it twice.

	It is a bottom sheet on a phone (the thumb is at the bottom, and the list stays visible
	behind it so you have not "gone" anywhere) and a centred card from 48rem up. Prev/next walk
	the filtered list without closing, so reading ten words in a row is nine taps, not eighteen.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { Hanzi, Pinyin } from '$lib/design';
	import type { Level, Word, WordProgress } from '$lib/types';
	import { posLong } from './pos';
	import StatusPip from './StatusPip.svelte';
	import { STATUS_META, progressLine, type WordStatus } from './status';

	interface Props {
		word: Word;
		status: WordStatus;
		record: WordProgress;
		level: Level;
		/** 1-based position in the filtered list, and its length — "412 of 1,070". */
		position: number;
		total: number;
		onclose: () => void;
		onprev: () => void;
		onnext: () => void;
	}

	let { word, status, record, level, position, total, onclose, onprev, onnext }: Props = $props();

	let panel = $state<HTMLElement | null>(null);

	const pos = $derived(posLong(word.pos));
	const meta = $derived(STATUS_META[status]);
	const line = $derived(progressLine(record));
	const hasPrev = $derived(position > 1);
	const hasNext = $derived(position < total);
	const practiseHref = $derived(resolve('/quiz/[level]', { level: String(level) }));

	// Opening moves focus into the sheet, so Escape, Tab and the arrow keys all land here and
	// not on the row underneath. The list restores focus to that row on close.
	$effect(() => {
		panel?.focus();
	});

	function focusables(): HTMLElement[] {
		if (!panel) return [];
		const selector = 'a[href], button:not([disabled])';
		return [...panel.querySelectorAll<HTMLElement>(selector)];
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}

		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			if (!hasNext) return;
			event.preventDefault();
			onnext();
			return;
		}

		if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			if (!hasPrev) return;
			event.preventDefault();
			onprev();
			return;
		}

		// A modal that leaks focus to the list behind it is a modal in name only.
		if (event.key !== 'Tab') return;
		const stops = focusables();
		if (stops.length === 0) return;
		const first = stops[0];
		const last = stops[stops.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && (active === first || active === panel)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<div class="root">
	<!-- A real button, so tapping outside closes without a div that pretends to be clickable. -->
	<button type="button" class="scrim" onclick={onclose}>
		<span class="sr-only">Close</span>
	</button>

	<div
		bind:this={panel}
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="word-sheet-title"
		tabindex="-1"
		onkeydown={onKeydown}
	>
		<span class="grip" aria-hidden="true"></span>

		<div class="bar">
			<p class="counter tabular">{position.toLocaleString('en')} of {total.toLocaleString('en')}</p>
			<div class="nav">
				<button type="button" class="step" disabled={!hasPrev} onclick={onprev}>
					<span class="sr-only">Previous word</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M15 5 8 12l7 7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.1"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button type="button" class="step" disabled={!hasNext} onclick={onnext}>
					<span class="sr-only">Next word</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="m9 5 7 7-7 7"
							fill="none"
							stroke="currentColor"
							stroke-width="2.1"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button type="button" class="step close" onclick={onclose}>
					<span class="sr-only">Close</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="m6 6 12 12M18 6 6 18"
							fill="none"
							stroke="currentColor"
							stroke-width="2.1"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</div>

		<div class="body">
			<h2 id="word-sheet-title" class="headword">
				<Hanzi text={word.hanzi} size="lg" display />
			</h2>

			{#if word.traditional}
				<p class="trad">
					traditional <span lang="zh-Hant" class="hanzi">{word.traditional}</span>
				</p>
			{/if}

			<Pinyin pinyin={word.pinyin} size="xl" tones class="py" />

			<!-- One block, so the gap above the meanings is the same whether or not the word
			     carries a part-of-speech annotation — plenty of them do not. -->
			<div class="gloss">
				{#if pos}<p class="pos eyebrow">{pos}</p>{/if}

				{#if word.meanings.length > 1}
					<ol class="senses">
						{#each word.meanings as meaning, i (i)}
							<li><span class="num tabular">{i + 1}</span>{meaning}</li>
						{/each}
					</ol>
				{:else}
					<p class="sense">{word.meanings[0] ?? '—'}</p>
				{/if}
			</div>

			<div class="record">
				<p class="state">
					<StatusPip {status} />
					<span class="label">{meta.label}</span>
					<span class="detail">{record.seen > 0 ? line : meta.description}</span>
				</p>
			</div>
		</div>

		<div class="foot">
			<a class="btn btn-primary btn-block" href={practiseHref}>Practise HSK {level}</a>
		</div>
	</div>
</div>

<style>
	.root {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}

	.scrim {
		position: absolute;
		inset: 0;
		min-block-size: 0;
		border: 0;
		/*
		 * The one colour here that is not a token, and deliberately so: a scrim has to darken
		 * in BOTH themes, and every ink token flips to near-white in the dark one — mixing
		 * with `--color-ink` lightens the list behind the sheet instead of pushing it back.
		 * This is the dark theme's own page value, used as a dimmer rather than as a surface.
		 */
		background-color: rgb(16 15 14 / 0.5);
		animation: sheet-fade 180ms var(--ease-out-soft) both;
	}

	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		max-block-size: min(88dvh, 44rem);
		padding-block-end: max(1rem, var(--app-safe-bottom));
		border-start-start-radius: var(--radius-xl);
		border-start-end-radius: var(--radius-xl);
		background-color: var(--color-surface);
		box-shadow: var(--shadow-lift);
		outline: none;
		animation: sheet-rise 240ms var(--ease-out-soft) both;
	}

	.grip {
		align-self: center;
		inline-size: 2.25rem;
		block-size: 0.25rem;
		margin-block-start: 0.5rem;
		border-radius: var(--radius-pill);
		background-color: var(--color-line-strong);
		opacity: 0.5;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-inline: 0.75rem 0.5rem;
	}

	.counter {
		margin: 0;
		padding-inline-start: 0.5rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.nav {
		display: flex;
		align-items: center;
	}

	.step {
		display: grid;
		place-items: center;
		inline-size: var(--spacing-tap);
		block-size: var(--spacing-tap);
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--color-ink-muted);
	}

	.step svg {
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	.step:disabled {
		opacity: 0.3;
	}

	.step.close {
		color: var(--color-ink);
	}

	@media (hover: hover) {
		.step:not(:disabled):hover {
			background-color: var(--color-surface-sunken);
			color: var(--color-ink);
		}
	}

	.body {
		flex: 1 1 auto;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-inline: max(1.25rem, var(--app-safe-left)) max(1.25rem, var(--app-safe-right));
		padding-block-end: 1.25rem;
	}

	/* Pleco's ranking, and Pleco's air: each step down gets less weight and more space above
	   it than the thing it belongs to. */
	.headword {
		margin: 0.25rem 0 0;
		font-size: inherit;
		font-weight: inherit;
		letter-spacing: normal;
	}

	.trad {
		margin: 0.375rem 0 0;
		color: var(--color-ink-subtle);
		font-size: var(--text-xs);
	}

	.trad .hanzi {
		margin-inline-start: 0.25rem;
		color: var(--color-ink-muted);
		font-size: var(--text-base);
	}

	.panel :global(.py) {
		display: block;
		margin-block-start: 0.375rem;
		color: var(--color-ink-muted);
	}

	.gloss {
		margin-block-start: 1.125rem;
	}

	.pos {
		margin: 0;
	}

	.sense,
	.senses {
		margin: 0.375rem 0 0;
		color: var(--color-ink);
		font-size: var(--text-lg);
		line-height: 1.5;
	}

	.senses {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0;
		list-style: none;
	}

	.num {
		display: inline-block;
		min-inline-size: 1.125rem;
		margin-inline-end: 0.375rem;
		color: var(--color-ink-subtle);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.record {
		margin-block-start: 1.5rem;
		padding-block-start: 1rem;
		border-block-start: 1px solid var(--color-line);
	}

	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--text-sm);
	}

	.label {
		font-weight: 600;
		color: var(--color-ink);
	}

	.detail {
		color: var(--color-ink-muted);
	}

	.foot {
		padding-block-start: 0.75rem;
		padding-inline: max(1.25rem, var(--app-safe-left)) max(1.25rem, var(--app-safe-right));
	}

	/* From tablet up the sheet stops being a sheet: a centred card reads as an entry rather
	   than a drawer, and there is no thumb at the bottom of a laptop screen. */
	@media (min-width: 48rem) {
		.root {
			justify-content: center;
			align-items: center;
			padding: 2rem;
		}

		.panel {
			inline-size: 100%;
			max-inline-size: 30rem;
			padding-block-end: 1.25rem;
			border-radius: var(--radius-card);
			animation-name: sheet-zoom;
		}

		.grip {
			display: none;
		}

		.bar {
			padding-block-start: 0.5rem;
		}
	}

	@keyframes sheet-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes sheet-rise {
		from {
			opacity: 0;
			transform: translate3d(0, 12%, 0);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes sheet-zoom {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>

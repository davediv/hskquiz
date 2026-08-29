<!--
	Level select — the first screen, and the one that decides whether anyone reaches a quiz.

	Two jobs. Say what each level is (band, size, what you actually meet there) so a newcomer
	can pick, and show what the learner has already done there so a returning one recognises
	their own history rather than a generic menu. Starting a session is one tap from the top
	of every card; browsing the words is the tap beside it.

	The layout is a single 34rem column on a phone and a two-column split from 64rem, where
	the standing information (what this is, where you are overall) parks in a sticky rail and
	the five levels get the reading column.
-->
<script lang="ts">
	import { LEVELS, type Level } from '$lib/types';
	import { SHIPPED_SIZES, SHIPPED_TOTAL } from '$lib/data/sizes';
	import { progress } from '$lib/progress';
	import LevelCard from '$lib/components/levels/LevelCard.svelte';
	import {
		formatAccuracy,
		formatWhen,
		levelStats,
		overallSummary
	} from '$lib/components/levels/stats';

	// Progress lives in localStorage, so the server renders an empty store and the client
	// renders a full one. Holding every progress-driven value back until after hydration keeps
	// the two in agreement; the markup is the same shape either way, so nothing jumps when the
	// real numbers arrive.
	let hydrated = $state(false);
	let now = $state(0);

	$effect(() => {
		now = Date.now();
		hydrated = true;
	});

	// NB: must not be named `state` — Svelte reads `$state` as store-access on a
	// binding called `state`, which breaks the rune itself.
	const snapshot = $derived(hydrated ? progress.state : null);
	const summary = $derived(overallSummary(snapshot));
	const cards = $derived(
		LEVELS.map((level: Level) => ({
			level,
			total: SHIPPED_SIZES[level],
			stats: levelStats(snapshot, level)
		}))
	);

	// The shipped count, not the official one: this number has to survive the tap through to
	// `/browse/2`, which can only ever show what is in the box.
	const totalWords = SHIPPED_TOTAL;
	const lastPlayed = $derived(formatWhen(summary.lastPlayed, now));

	/** The one-line headline over the level list. Only stats that have a value appear. */
	const headline = $derived.by(() => {
		const stats: { value: string; label: string }[] = [
			{ value: String(summary.practised), label: 'words practised' }
		];
		if (summary.mastered > 0) stats.push({ value: String(summary.mastered), label: 'mastered' });
		if (summary.accuracy !== null) {
			stats.push({ value: formatAccuracy(summary.accuracy), label: 'correct' });
		}
		if (lastPlayed) stats.push({ value: lastPlayed, label: '' });
		return stats;
	});

	let confirmingReset = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	function onReset() {
		clearTimeout(resetTimer);
		if (!confirmingReset) {
			// Two taps, no modal: the second one inside four seconds is the one that erases.
			confirmingReset = true;
			resetTimer = setTimeout(() => (confirmingReset = false), 4000);
			return;
		}
		confirmingReset = false;
		progress.resetAll();
	}
</script>

<div class="hskq-page">
	<header class="hskq-rail">
		<p class="eyebrow">HSK 3.0 · Levels 1–5</p>
		<h1 class="mt-1.5 hanzi-display text-hanzi-lg text-ink" lang="zh-Hans">词汇练习</h1>
		<p class="mt-1.5 pinyin text-pinyin-md text-accent">cí huì liàn xí</p>
		<p class="mt-2.5 max-w-[38ch] text-sm text-ink-muted">
			{totalWords.toLocaleString('en')} words, five levels. Ten questions a session, weighted toward what
			you keep missing.
		</p>

		<!-- Hairlines rather than a card: on a phone this sits between the reader and the first
		     level, so it has to earn every pixel it costs. Separators are drawn in CSS so that
		     dropping a stat can never take an adjoining space with it. -->
		<section class="hskq-strip" aria-label="Your progress">
			{#if summary.started}
				<p class="tabular text-xs text-ink-muted">
					{#each headline as stat (stat.label)}
						<span class="hskq-stat">
							<strong class="font-semibold text-ink">{stat.value}</strong>
							{stat.label}
						</span>
					{/each}
				</p>
				<button
					type="button"
					class="hskq-reset shrink-0 rounded-sm px-2 text-xs font-semibold"
					class:hskq-reset-armed={confirmingReset}
					onclick={onReset}
				>
					{confirmingReset ? 'Tap again to erase' : 'Reset'}
				</button>
			{:else}
				<p class="text-xs text-ink-subtle">
					Nothing practised yet — pick a level below. Progress is kept on this device, no account
					needed.
				</p>
			{/if}
		</section>
	</header>

	<main class="hskq-levels">
		<h2 class="sr-only">Choose a level</h2>
		<ul class="flex flex-col gap-3.5">
			{#each cards as card (card.level)}
				<li>
					<LevelCard
						level={card.level}
						total={card.total}
						stats={card.stats}
						{now}
						suggested={!summary.started && card.level === 1}
					/>
				</li>
			{/each}
		</ul>
	</main>
</div>

<style>
	.hskq-page {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-block: 1.25rem 2.5rem;
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left, 0px));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right, 0px));
	}

	.hskq-levels {
		margin-block-start: 1.25rem;
	}

	.hskq-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-block-size: 3.25rem;
		margin-block-start: 1.125rem;
		padding-block: 0.75rem;
		border-block: 1px solid var(--color-line);
	}

	/* From 64rem the standing information stops scrolling with the list it describes. */
	@media (min-width: 64rem) {
		.hskq-page {
			display: grid;
			grid-template-columns: 19rem minmax(0, 32rem);
			justify-content: center;
			gap: 3.5rem;
			max-inline-size: 60rem;
			padding-block: 3.5rem 4rem;
			padding-inline: 2rem;
		}

		.hskq-rail {
			position: sticky;
			top: calc(var(--app-header-h, 3.5rem) + 2rem);
			align-self: start;
		}

		.hskq-levels {
			margin-block-start: 0;
		}
	}

	/* Separator lives on the element, so a missing stat cannot leave a stranded dot. */
	.hskq-stat + .hskq-stat::before {
		content: ' · ';
		color: var(--color-ink-subtle);
	}

	.hskq-reset {
		/* Keeps the 44px hit area without letting it inflate the strip it sits in. */
		min-block-size: var(--spacing-tap);
		margin-block: -0.75rem;
		color: var(--color-ink-subtle);
		transition:
			color 140ms var(--ease-out-soft),
			background-color 140ms var(--ease-out-soft);
	}

	.hskq-reset-armed {
		color: var(--color-accent);
		background-color: var(--color-accent-soft);
	}

	@media (hover: hover) {
		.hskq-reset:hover {
			color: var(--color-ink);
		}

		.hskq-reset-armed:hover {
			color: var(--color-accent);
		}
	}
</style>

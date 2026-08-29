<!--
	Level select — the first screen, and the one that decides whether anyone reaches a quiz.

	Three jobs. Say what each level is (band, size, and the words you actually meet there) so a
	newcomer can pick. Show what the learner has already done there so a returning one recognises
	their own history rather than a generic menu. And point at exactly one of the five, because a
	menu where every row shouts equally is a menu nobody starts from.

	The layout is a single 34rem column on a phone and a two-column split from 64rem, where the
	standing information (what this is, where you are overall) parks in a sticky rail and the five
	levels get the reading column — two abreast, so the whole list is on one screen.
-->
<script lang="ts">
	import { LEVELS, LEVEL_SIZES, type Level } from '$lib/types';
	import { SHIPPED_SIZES, SHIPPED_TOTAL } from '$lib/data/sizes';
	import { progress } from '$lib/progress';
	import StorageNotice from '$lib/progress/StorageNotice.svelte';
	import LevelCard from '$lib/components/levels/LevelCard.svelte';
	import { LEVEL_BANDS } from '$lib/components/levels/levelMeta';
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
	const byLevel = $derived(new Map(cards.map((card) => [card.level, card])));

	/**
	 * The shipped count and the official one, and the gap between them stated out loud.
	 *
	 * The standard this app cites says 4,316; the box holds 4,308, because eight pairs of
	 * same-pinyin homographs (老, 省, 把 …) are one card each — see `src/lib/data/sizes.ts`.
	 * Printing 4,308 under that citation with no explanation is how a correct word list gets
	 * read as a broken one, so the difference is derived here rather than described, and can
	 * never drift out of step with either constant.
	 */
	const officialTotal = LEVELS.reduce((sum, level) => sum + LEVEL_SIZES[level], 0);
	const mergedPairs = officialTotal - SHIPPED_TOTAL;

	const lastPlayed = $derived(formatWhen(summary.lastPlayed, now));

	/** The one-line headline over the level list. Only stats that have a value appear. */
	const headline = $derived.by(() => {
		const stats: { value: string; label: string }[] = [
			{
				value: String(summary.practised),
				label: summary.practised === 1 ? 'word practised' : 'words practised'
			}
		];
		if (summary.mastered > 0) stats.push({ value: String(summary.mastered), label: 'mastered' });
		if (summary.accuracy !== null) {
			stats.push({ value: formatAccuracy(summary.accuracy), label: 'correct' });
		}
		if (lastPlayed) stats.push({ value: lastPlayed, label: '' });
		return stats;
	});

	/**
	 * Exactly one card carries the filled button, in every state. A first-time visitor is sent
	 * to HSK 1; a returning one is sent back where they left off, which is the level they last
	 * played, or failing that the deepest one they have touched.
	 */
	const featured = $derived.by(() => {
		if (!summary.started) return 1 as Level;
		const played = cards.filter((card) => card.stats.lastPlayed > 0);
		if (played.length > 0) {
			return played.reduce((a, b) => (b.stats.lastPlayed > a.stats.lastPlayed ? b : a)).level;
		}
		const touched = cards.filter((card) => card.stats.practised > 0);
		return touched.length > 0 ? touched[touched.length - 1].level : (1 as Level);
	});
	const featuredLabel = $derived(summary.started ? 'Continue' : 'Start here');

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
		<!-- 汉语拼音正词法基本规则 joins the syllables inside a word: cíhuì liànxí, never
		     cí huì liàn xí. This is the app's most prominent pinyin — it teaches on sight. -->
		<p class="mt-1.5 pinyin text-pinyin-md text-accent" lang="zh-Latn-pinyin">cíhuì liànxí</p>
		<p class="mt-2.5 max-w-[38ch] text-sm text-ink-muted">
			Five levels, ten questions a session, weighted toward what you keep missing.
		</p>
		<p class="mt-1.5 max-w-[44ch] text-xs text-ink-subtle">
			{SHIPPED_TOTAL.toLocaleString('en')} cards from the standard's {officialTotal.toLocaleString(
				'en'
			)} entries — {mergedPairs} pairs of same-pinyin homographs share a card.
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
				<!-- One line, not three: on a first visit this sits between the reader and the first
				     level, and the five empty cards below already say nothing has been practised.
				     Only claimed while writes are actually landing — `StorageNotice` below says
				     the opposite when they are not, and the two must never be on screen together. -->
				{#if !hydrated || progress.status === 'saving'}
					<p class="text-xs text-ink-subtle">
						Progress is kept on this device — no account needed.
					</p>
				{/if}
			{/if}
		</section>

		<!-- Silent while writes land; one line when they do not. -->
		<StorageNotice class="mt-2.5" />
	</header>

	<main class="hskq-levels" aria-label="Choose a level">
		<!-- Grouped by band rather than repeating ELEMENTARY on three cards in a row: the heading
		     says it once, and gets to carry 初等 / 中等 at a size hanzi is legible at. -->
		{#each LEVEL_BANDS as band (band.key)}
			<section class="hskq-band-section" aria-labelledby="band-{band.key}">
				<h2 class="hskq-band" id="band-{band.key}">
					<span class="hanzi text-hanzi-xs text-ink" lang="zh-Hans">{band.hanzi}</span>
					<span class="eyebrow"
						>{band.name} · HSK {band.levels[0]}–{band.levels[band.levels.length - 1]}</span
					>
					<span class="hskq-rule" aria-hidden="true"></span>
				</h2>
				<ul class="hskq-grid">
					{#each band.levels as level (level)}
						{@const card = byLevel.get(level)}
						{#if card}
							<li>
								<LevelCard
									level={card.level}
									total={card.total}
									stats={card.stats}
									{now}
									featured={card.level === featured}
									{featuredLabel}
								/>
							</li>
						{/if}
					{/each}
				</ul>
			</section>
		{/each}
	</main>
</div>

<style>
	.hskq-page {
		inline-size: 100%;
		max-inline-size: var(--container-app);
		margin-inline: auto;
		padding-block: 0.75rem 2.5rem;
		padding-inline-start: max(var(--spacing-gutter), var(--app-safe-left, 0px));
		padding-inline-end: max(var(--spacing-gutter), var(--app-safe-right, 0px));
	}

	.hskq-levels {
		margin-block-start: 0.875rem;
	}

	.hskq-band-section + .hskq-band-section {
		margin-block-start: 1rem;
	}

	/* Baseline-aligned hanzi + eyebrow, with a hairline running out to the edge so the group
	   reads as a divider and not as a sixth card. */
	.hskq-band {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
		margin-block-end: 0.375rem;
		font-size: inherit;
		font-weight: inherit;
		letter-spacing: normal;
	}

	.hskq-rule {
		flex: 1;
		block-size: 1px;
		background-color: var(--color-line);
	}

	.hskq-grid {
		display: grid;
		gap: 0.625rem;
	}

	.hskq-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-start: 0.875rem;
		padding-block: 0.625rem;
		border-block: 1px solid var(--color-line);
	}

	/* From 64rem the standing information stops scrolling with the list it describes, and the
	   list itself goes two abreast — 1,440px was spending 480px on nothing while the fifth
	   level sat below the fold. */
	@media (min-width: 64rem) {
		.hskq-page {
			display: grid;
			grid-template-columns: 18rem minmax(0, 46rem);
			justify-content: center;
			gap: 3rem;
			max-inline-size: 70rem;
			padding-block: 1.5rem 3rem;
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

		.hskq-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
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
		margin-block: -0.625rem;
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

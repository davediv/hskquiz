<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Level } from '$lib/types';
	import { LEVEL_META } from './levelMeta';
	import { formatAccuracy, formatWhen, type LevelStats } from './stats';

	interface Props {
		level: Level;
		/** Words in the level — the denominator for the meter. */
		total: number;
		stats: LevelStats;
		/** Epoch ms used for relative time. 0 before hydration, which hides the timestamp. */
		now: number;
		/** Marks the recommended first level when nothing has been practised anywhere. */
		suggested?: boolean;
	}

	let { level, total, stats, now, suggested = false }: Props = $props();

	const meta = $derived(LEVEL_META[level]);
	// resolve() rather than a literal href, so both links survive a non-empty `base`.
	const quizHref = $derived(resolve('/quiz/[level]', { level: String(level) }));
	const browseHref = $derived(resolve('/browse/[level]', { level: String(level) }));
	const pct = $derived(total > 0 ? Math.min(100, (stats.practised / total) * 100) : 0);

	// Two slots of meta under the meter. Both may be empty; the row holds its height either
	// way, so a fresh card and a well-worn one are exactly the same size.
	const left = $derived(
		stats.practised === 0
			? 'Not practised yet'
			: stats.mastered > 0
				? `${stats.practised} practised · ${stats.mastered} mastered`
				: `${stats.practised} practised`
	);
	const right = $derived(
		[formatAccuracy(stats.accuracy), formatWhen(stats.lastPlayed, now)].filter(Boolean).join(' · ')
	);
</script>

<article class="card hskq-card p-4.5" aria-labelledby="level-{level}-title">
	<div class="flex items-center gap-3.5">
		<span
			class="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-accent hanzi-display text-hanzi-md text-accent-ink"
			aria-hidden="true">{meta.numeral}</span
		>

		<div class="min-w-0 flex-1">
			<!-- Band only, no 初等/中等: the design system floors hanzi at 20px, and an eyebrow
			     is 11px. The numeral tile is where this card speaks Chinese. -->
			<p class="eyebrow">{meta.band}</p>
			<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
				<h2 id="level-{level}-title" class="text-xl leading-tight font-semibold">HSK {level}</h2>
				{#if suggested}
					<span class="chip chip-accent">Start here</span>
				{/if}
			</div>
		</div>

		<p class="shrink-0 text-right leading-none">
			<span class="block tabular text-lg font-semibold">{total}</span>
			<span class="mt-1 block text-2xs tracking-normal text-ink-subtle">words</span>
		</p>
	</div>

	<!-- Full width rather than beside the numeral: at 375px a phrase this long wraps in a
	     narrow column, and cards that wrap differently stop looking like one list. -->
	<p class="mt-3 text-sm leading-snug text-ink-muted">{meta.blurb}</p>

	<div class="meter mt-3" aria-hidden="true">
		{#if pct > 0}<div class="hskq-fill" style:width="{pct}%"></div>{/if}
	</div>
	<div class="mt-2 flex min-h-[1.05rem] items-baseline justify-between gap-3 tabular text-xs">
		<span class="min-w-0 text-ink-muted">{left}</span>
		<span class="shrink-0 text-ink-subtle">{right}</span>
	</div>

	<div class="mt-3.5 flex gap-2.5">
		<a class="btn btn-primary flex-1" href={quizHref}>
			Practise<span class="sr-only"> HSK {level}</span>
		</a>
		<a class="btn btn-quiet shrink-0" href={browseHref}>
			Browse<span class="sr-only"> HSK {level} vocabulary</span>
		</a>
	</div>
</article>

<style>
	.hskq-card {
		transition: box-shadow 180ms var(--ease-out-soft);
	}

	/* A handful of words out of a thousand is still worth seeing. */
	.hskq-fill {
		min-width: 0.625rem;
	}

	@media (hover: hover) {
		.hskq-card:hover {
			box-shadow: var(--shadow-lift);
		}
	}
</style>
